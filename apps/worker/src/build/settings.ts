/**
 * What a developer may type about their build, checked the same way where it enters (the server) and where it is used
 * (the builder): the repo address, the branch, the app's directory in the repo, the build command and the output
 * directory. Paths are relative and can never leave the workspace; the build command runs only inside the build
 * container (as one argument of `sh -c` there), never in a shell of the server.
 */
import { z } from 'zod';

export type RepoHost = 'github' | 'gitlab';

export interface RepoUrl {
  readonly host: RepoHost;
  /** `owner/repo` (GitLab: `group/subgroup/repo`). */
  readonly path: string;
  /** The address as shown and stored: `https://github.com/owner/repo`. */
  readonly url: string;
  /** What git clones. */
  readonly cloneUrl: string;
}

const GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})\/?$/;
const GITLAB = /^https:\/\/gitlab\.com\/((?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}\/){1,20}[A-Za-z0-9_][A-Za-z0-9_.-]{0,254})\/?$/;

/** A public GitHub or GitLab repo address, normalized; null for anything else (other hosts, http, credentials, paths). */
export function parseRepoUrl(input: unknown): RepoUrl | null {
  if (typeof input !== 'string' || input.length > 300) return null;
  const trimmed = input.trim().replace(/\.git\/?$/, '');
  const github = GITHUB.exec(trimmed);
  if (github?.[1] && github[2]) {
    const repo = github[2];
    if (repo === '.' || repo === '..' || repo.endsWith('.')) return null;
    const path = `${github[1]}/${repo}`;
    return { host: 'github', path, url: `https://github.com/${path}`, cloneUrl: `https://github.com/${path}.git` };
  }
  const gitlab = GITLAB.exec(trimmed);
  if (gitlab?.[1]) {
    const path = gitlab[1];
    if (path.split('/').some((part) => part.endsWith('.') || part.includes('..') || part.endsWith('.atom'))) return null;
    return { host: 'gitlab', path, url: `https://gitlab.com/${path}`, cloneUrl: `https://gitlab.com/${path}.git` };
  }
  return null;
}

/** The raw address of one file of the repo at `ref` (a commit), for the check before the first build. */
export function rawFileUrl(repo: RepoUrl, ref: string, file: string): string {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return repo.host === 'github' ? `https://raw.githubusercontent.com/${repo.path}/${ref}/${encoded}` : `https://gitlab.com/${repo.path}/-/raw/${ref}/${encoded}`;
}

/** A branch name git accepts and that cannot be read as an option or a path trick. */
export function checkBranch(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const branch = input.trim();
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branch)) return null;
  if (branch.startsWith('-') || branch.startsWith('/') || branch.startsWith('.') || branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) return null;
  if (branch.includes('..') || branch.includes('//') || branch.includes('/.')) return null;
  return branch;
}

/** A 40-character commit id (sha-1) or 64 (sha-256). */
export function isCommitSha(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
}

/**
 * A directory relative to the repo (or to the app's directory): `''` for the directory itself. Null when it is
 * absolute, climbs out (`..`), or has characters a project directory does not need.
 */
export function checkRelativeDir(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (value === '' || value === '.') return '';
  if (value.length > 200 || !/^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/.test(value)) return null;
  if (value.split('/').some((part) => part === '.' || part === '..')) return null;
  return value;
}

/** One line of printable text, at most 300 characters; the command runs in the build container only. */
export function checkBuildCommand(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (value === '' || value.length > 300) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export const buildSettingsSchema = z.object({
  rootDir: z.string().transform((value, ctx) => {
    const dir = checkRelativeDir(value);
    if (dir === null) ctx.addIssue({ code: 'custom', message: 'root-dir' });
    return dir ?? '';
  }),
  buildCommand: z.string().nullable().transform((value, ctx) => {
    if (value === null || value.trim() === '') return null;
    const command = checkBuildCommand(value);
    if (command === null) ctx.addIssue({ code: 'custom', message: 'build-command' });
    return command;
  }),
  outputDir: z.string().transform((value, ctx) => {
    const dir = checkRelativeDir(value);
    if (dir === null) ctx.addIssue({ code: 'custom', message: 'output-dir' });
    return dir ?? '';
  }),
});

/** `a/b` joined to `c` as `a/b/c`, with `''` meaning the directory itself. */
export function joinRel(...parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join('/');
}
