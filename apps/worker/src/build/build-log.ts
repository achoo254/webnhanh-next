/**
 * Reading a build's output as it comes: each line turned into a short progress the waiting screen can word ("Đang cài
 * 214 gói…", "Vite đang build 38 file…"), and at the end, when a step failed, the likely cause and the lines that
 * show it. Codes only: the web app writes the sentences, in the reader's language.
 */
import type { BuildProgress } from '@webnhanh/db';

export type BuildStage = 'install' | 'build';

/** The progress a line shows, or null when it says nothing new. */
export function progressOf(stage: BuildStage, line: string): BuildProgress | null {
  const text = line.trim();
  if (text === '') return null;
  if (stage === 'install') {
    const pnpm = /Progress: resolved (\d+)/.exec(text) ?? /Packages: \+(\d+)/.exec(text);
    if (pnpm?.[1]) return { code: 'install-packages', n: Number(pnpm[1]) };
    const npm = /added (\d+) packages?/.exec(text);
    if (npm?.[1]) return { code: 'install-packages', n: Number(npm[1]) };
    if (/Fetching packages|Linking dependencies|YN0000: ┌ (Fetch|Link) step/.test(text)) return { code: 'install' };
    return { code: 'line', text: text.slice(0, 120) };
  }
  const vite = /transforming \((\d+)\)/.exec(text) ?? /(\d+) modules? transformed/.exec(text);
  if (vite?.[1]) return { code: 'build-modules', n: Number(vite[1]) };
  const pages = /Generating static pages \((\d+)\/(\d+)\)/.exec(text);
  if (pages?.[1] && pages[2]) return { code: 'build-pages', n: Number(pages[1]), total: Number(pages[2]) };
  const astro = /(\d+) page\(s\) built/.exec(text);
  if (astro?.[1]) return { code: 'build-pages', n: Number(astro[1]) };
  return { code: 'line', text: text.slice(0, 120) };
}

export type BuildFailureCode =
  | 'build-timeout'
  | 'build-oom'
  | 'lockfile'
  | 'install-failed'
  | 'build-failed';

export interface StepOutcome {
  readonly stage: BuildStage;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

const OOM = /JavaScript heap out of memory|Reached heap limit|ENOMEM|Killed\s*$|exit code 137/i;
const LOCKFILE =
  /can only install (?:packages )?(?:with an existing|when your package\.json and package-lock\.json)|ERR_PNPM_NO_LOCKFILE|ERR_PNPM_OUTDATED_LOCKFILE|frozen-lockfile|lockfile needs to be updated|YN0028|Your lockfile needs to be updated|not up to date with/i;
const ERRORISH = /error|failed|cannot|could not|not found|ERR!|✘|×/i;

/** Why a step failed, from its exit and its log. */
export function failureOf(outcome: StepOutcome, lines: readonly string[]): BuildFailureCode {
  if (outcome.timedOut) return 'build-timeout';
  const tail = lines.slice(-300);
  if (outcome.exitCode === 137 || tail.some((line) => OOM.test(line))) return 'build-oom';
  if (outcome.stage === 'install') return tail.some((line) => LOCKFILE.test(line)) ? 'lockfile' : 'install-failed';
  return 'build-failed';
}

/**
 * The lines worth showing with a failure (at most `max`): around the first line that reads like an error in the last
 * part of the log, else the last lines.
 */
export function relevantLines(lines: readonly string[], max = 15): string[] {
  const tail = lines.slice(-300).filter((line) => line.trim() !== '');
  const first = tail.findIndex((line) => ERRORISH.test(line));
  if (first === -1) return tail.slice(-max);
  const start = Math.max(0, first - 2);
  return tail.slice(start, start + max);
}

/**
 * Collects a step's lines: all of them for the stored log (in batches), the recent ones for explaining a failure, and
 * the latest progress.
 */
export class LogCollector {
  readonly recent: string[] = [];
  private pending: string[] = [];
  private latest: BuildProgress | null = null;
  private stage: BuildStage = 'install';

  setStage(stage: BuildStage): void {
    this.stage = stage;
    this.recent.length = 0;
  }

  add(line: string): void {
    this.pending.push(line);
    this.recent.push(line);
    if (this.recent.length > 400) this.recent.splice(0, this.recent.length - 300);
    this.latest = progressOf(this.stage, line) ?? this.latest;
  }

  /** A note of the builder's own, in the log the person reads. */
  note(line: string): void {
    this.pending.push(`› ${line}`);
  }

  /** Lines not stored yet, and the progress to show; both cleared. */
  drain(): { lines: string[]; progress: BuildProgress | null } {
    const lines = this.pending;
    const progress = this.latest;
    this.pending = [];
    this.latest = null;
    return { lines, progress };
  }
}
