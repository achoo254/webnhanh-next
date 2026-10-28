/**
 * The package directories a monorepo declares (`packages` of pnpm-workspace.yaml, or `workspaces` of package.json),
 * relative to the repo: where the check looks for the app when the chosen folder is only the workspace root. Nothing
 * of the repo runs and little is read: simple globs only (`apps/*`, `apps/site-*`, `packages/**` at most two levels
 * deep, exact paths; negations are ignored), a bounded number of directory listings and of directories, and the
 * sources never follow a symlink. A source that cannot list directories (the remote check reads single files over
 * HTTPS) learns the packages from the lockfile it already read: pnpm `importers`, npm `packages`, Yarn 2+
 * `@workspace:` entries.
 */
import type { ProjectSource } from './detect';
import { checkRelativeDir, joinRel } from './settings';

/** At most this many package directories are returned (and so at most this many package.json files read). */
export const MAX_WORKSPACE_DIRS = 50;
const MAX_GLOBS = 20;
const MAX_LISTINGS = 40;
/** How deep `**` reaches. */
const GLOBSTAR_DEPTH = 2;
const SEGMENT = /^[A-Za-z0-9._@+*-]+$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])(.*)\1$/.exec(trimmed);
  return quoted?.[2] ?? trimmed;
}

/** The globs of pnpm-workspace.yaml's `packages`, written as a block list or a flow list. */
export function pnpmWorkspaceGlobs(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => /^packages\s*:/.test(line));
  if (at === -1) return [];
  const flow = /^packages\s*:\s*\[(.*)\]\s*(?:#.*)?$/.exec(lines[at] ?? '');
  if (flow) return (flow[1] ?? '').split(',').map(unquote).filter((glob) => glob !== '');
  const globs: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const item = /^\s*-\s*(.+?)\s*(?:\s#.*)?$/.exec(line);
    if (!item?.[1]) break;
    globs.push(unquote(item[1]));
  }
  return globs;
}

/** `workspaces` of a package.json: a list of globs (npm, Yarn) or `{ packages: [...] }` (Yarn 1). */
export function packageJsonWorkspaces(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'object' && value !== null ? (value as Record<string, unknown>).packages : null;
  return Array.isArray(list) ? list.filter((glob): glob is string => typeof glob === 'string') : [];
}

/** Directories a workspace never takes as packages: installed dependencies and hidden directories. */
const skipped = (name: string): boolean => name === 'node_modules' || name.startsWith('.');

/** A glob as path segments, or null for a negation or anything beyond simple globs. */
function globSegments(glob: string): string[] | null {
  const value = glob.trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (value === '' || value.startsWith('!') || value.length > 200) return null;
  const segments = value.split('/');
  const plain = segments.every((segment) => segment === '**' || (SEGMENT.test(segment) && !skipped(segment) && !segment.includes('**')));
  return plain ? segments : null;
}

function segmentPattern(segment: string): RegExp {
  return new RegExp(`^${segment.replace(/[.+]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
}

/** Whether `parts` (a path relative to the workspace root) is matched by the glob `segments`. */
function matches(segments: readonly string[], parts: readonly string[]): boolean {
  const [first, ...rest] = segments;
  if (first === undefined) return parts.length === 0;
  if (first === '**') {
    for (let depth = 1; depth <= GLOBSTAR_DEPTH && depth <= parts.length; depth += 1) {
      if (parts.slice(0, depth).some(skipped)) break;
      if (matches(rest, parts.slice(depth))) return true;
    }
    return false;
  }
  const [part, ...others] = parts;
  return part !== undefined && !skipped(part) && segmentPattern(first).test(part) && matches(rest, others);
}

type ListingSource = Pick<Required<ProjectSource>, 'list'>;

/** Expands the globs by listing directories, within a budget of listings. */
async function expandByListing(source: ListingSource, rootDir: string, globs: readonly string[][]): Promise<string[]> {
  let listings = 0;
  const children = async (dir: string): Promise<string[]> => {
    if (listings >= MAX_LISTINGS) return [];
    listings += 1;
    return (await source.list(dir)).filter((name) => !skipped(name)).map((name) => joinRel(dir, name));
  };
  const found: string[] = [];
  for (const segments of globs) {
    let current = [rootDir];
    for (const segment of segments) {
      const next: string[] = [];
      for (const dir of current) {
        if (segment === '**') {
          let level = [dir];
          for (let depth = 1; depth <= GLOBSTAR_DEPTH; depth += 1) {
            const deeper: string[] = [];
            for (const parent of level) deeper.push(...(await children(parent)));
            next.push(...deeper);
            level = deeper;
          }
        } else if (segment.includes('*')) {
          const pattern = segmentPattern(segment);
          next.push(...(await children(dir)).filter((child) => pattern.test(child.slice(child.lastIndexOf('/') + 1))));
        } else {
          next.push(joinRel(dir, segment));
        }
      }
      current = next.slice(0, MAX_WORKSPACE_DIRS * 4);
    }
    found.push(...current);
  }
  return found;
}

/** The package directories a lockfile names, relative to the lockfile's directory (`.` is the workspace root). */
export function lockfileWorkspaces(lockfile: string, text: string): string[] {
  const name = lockfile.slice(lockfile.lastIndexOf('/') + 1);
  const paths: string[] = [];
  if (name === 'pnpm-lock.yaml') {
    let inImporters = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^\S/.test(line)) inImporters = /^importers\s*:/.test(line);
      else if (inImporters) {
        // `  apps/site:`, or `  apps/site: {}` for a package without dependencies.
        const key = /^ {2}(\S.*?):(?:\s*\{\})?\s*$/.exec(line);
        if (key?.[1]) paths.push(unquote(key[1]));
      }
    }
  } else if (name === 'package-lock.json' || name === 'npm-shrinkwrap.json') {
    // Keys of `packages`; installed dependencies sit under node_modules. A truncated lockfile still gives its first keys.
    for (const match of text.matchAll(/^ {4}"([^"]+)": \{/gm)) {
      if (match[1] && !match[1].split('/').includes('node_modules')) paths.push(match[1]);
    }
  } else if (name === 'yarn.lock') {
    for (const match of text.matchAll(/@workspace:([^",\s]+)/g)) if (match[1]) paths.push(match[1]);
  }
  return paths;
}

export interface WorkspaceInput {
  /** The chosen folder, where the workspace is declared. */
  readonly rootDir: string;
  /** `workspaces` of the folder's package.json. */
  readonly workspaces: readonly string[];
  /** The lockfile found for the folder (it may be above it), relative to the repo. */
  readonly lockfile: string | null;
}

/** The workspace's package directories (relative to the repo, sorted, without the root itself); none when undeclared. */
export async function workspaceDirs(source: ProjectSource, input: WorkspaceInput): Promise<string[]> {
  const declared = [...input.workspaces];
  const pnpm = await source.read(joinRel(input.rootDir, 'pnpm-workspace.yaml'));
  if (pnpm !== null) declared.push(...pnpmWorkspaceGlobs(pnpm));
  const globs = declared
    .slice(0, MAX_GLOBS)
    .map(globSegments)
    .filter((segments): segments is string[] => segments !== null);
  if (globs.length === 0) return [];

  let dirs: string[] = [];
  const list = source.list?.bind(source);
  if (list) {
    dirs = await expandByListing({ list }, input.rootDir, globs);
  } else if (input.lockfile !== null) {
    const text = await source.read(input.lockfile);
    const lockDir = input.lockfile.includes('/') ? input.lockfile.slice(0, input.lockfile.lastIndexOf('/')) : '';
    const prefix = input.rootDir === '' ? '' : `${input.rootDir}/`;
    for (const path of text === null ? [] : lockfileWorkspaces(input.lockfile, text)) {
      const full = checkRelativeDir(joinRel(lockDir, path === '.' ? '' : path));
      if (full === null || full === '' || !full.startsWith(prefix)) continue;
      const parts = full.slice(prefix.length).split('/');
      if (globs.some((segments) => matches(segments, parts))) dirs.push(full);
    }
  }
  const valid = dirs.filter((dir) => dir !== input.rootDir && checkRelativeDir(dir) === dir);
  return [...new Set(valid)].sort().slice(0, MAX_WORKSPACE_DIRS);
}
