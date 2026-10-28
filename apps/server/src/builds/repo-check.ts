/**
 * The check right after a repo link is pasted, before anything is queued: a few seconds, nothing of the repo runs.
 * The branch and its commit come from git's own HTTP ref list (`info/refs`, not GitHub's rate-limited API), then the
 * handful of files `detectProject` asks for are read from the host's raw file address at that commit. Only
 * github.com, raw.githubusercontent.com and gitlab.com are ever asked (the address is checked by `parseRepoUrl`), no
 * redirect is followed, every answer is size- and time-limited.
 */
import { checkBranch, detectProject, rawFileUrl, type Detection, type ProjectSource, type RepoUrl } from '@webnhanh/worker/build';
import { HttpError } from '../http-error';

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 6_000;
const MAX_REFS_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;

/** Reads at most `max` bytes of a body (the rest is dropped). */
async function readCapped(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      size += value.length;
      if (size >= max) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, max);
}

async function get(fetcher: Fetcher, url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  return fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'git/2.45 (webnhanh-check)' } });
}

export interface RemoteRefs {
  /** The branch HEAD points to. */
  readonly defaultBranch: string | null;
  /** Branch name → commit. */
  readonly branches: ReadonlyMap<string, string>;
}

/** Parses git's smart-HTTP ref advertisement (protocol v0/v1 pkt-lines). */
export function parseRefAdvertisement(body: Buffer): RemoteRefs {
  const branches = new Map<string, string>();
  let defaultBranch: string | null = null;
  let at = 0;
  while (at + 4 <= body.length) {
    const length = Number.parseInt(body.subarray(at, at + 4).toString('ascii'), 16);
    if (Number.isNaN(length)) break;
    if (length === 0) {
      at += 4;
      continue;
    }
    const line = body.subarray(at + 4, at + length).toString('utf8').replace(/\n$/, '');
    at += length;
    const [refPart, capabilities = ''] = line.split('\0');
    const symref = /symref=HEAD:refs\/heads\/(\S+)/.exec(capabilities);
    if (symref?.[1]) defaultBranch = symref[1];
    const match = /^([0-9a-f]{40,64}) refs\/heads\/(.+)$/.exec(refPart ?? '');
    if (match?.[1] && match[2]) branches.set(match[2], match[1]);
  }
  return { defaultBranch, branches };
}

/** The branches of a public repo; 404 `repo-not-found` for a private or missing one. */
export async function remoteRefs(fetcher: Fetcher, repo: RepoUrl): Promise<RemoteRefs> {
  let res: Response;
  try {
    res = await get(fetcher, `${repo.cloneUrl}/info/refs?service=git-upload-pack`);
  } catch {
    throw new HttpError(502, 'repo-unreachable');
  }
  // GitHub and GitLab ask for credentials (401) rather than say a repo is private.
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new HttpError(404, 'repo-not-found');
  if (!res.ok) throw new HttpError(502, 'repo-unreachable');
  return parseRefAdvertisement(await readCapped(res, MAX_REFS_BYTES));
}

/** Files of the repo at one commit, read over HTTPS as `detectProject` asks for them. */
export function remoteSource(fetcher: Fetcher, repo: RepoUrl, commit: string): ProjectSource {
  const cache = new Map<string, Promise<string | null>>();
  const read = (path: string): Promise<string | null> => {
    const known = cache.get(path);
    if (known) return known;
    const loading = get(fetcher, rawFileUrl(repo, commit, path))
      .then(async (res) => (res.ok ? (await readCapped(res, MAX_FILE_BYTES)).toString('utf8') : null))
      .catch(() => null);
    cache.set(path, loading);
    return loading;
  };
  return { read, exists: async (path) => (await read(path)) !== null };
}

export interface RepoCheck {
  readonly branch: string;
  readonly commit: string;
  readonly detection: Detection;
}

/** Resolves the branch (the default one when none is given) and recognizes the project in `rootDir`. */
export async function checkRepo(fetcher: Fetcher, repo: RepoUrl, branchInput: string | null, rootDir: string): Promise<RepoCheck> {
  const refs = await remoteRefs(fetcher, repo);
  const branch = branchInput ?? refs.defaultBranch ?? (refs.branches.has('main') ? 'main' : refs.branches.has('master') ? 'master' : null);
  if (branch === null || checkBranch(branch) !== branch) throw new HttpError(404, 'branch-not-found');
  const commit = refs.branches.get(branch);
  if (!commit) throw new HttpError(404, 'branch-not-found', { branches: [...refs.branches.keys()].slice(0, 20) });
  const detection = await detectProject(remoteSource(fetcher, repo, commit), rootDir);
  return { branch, commit, detection };
}
