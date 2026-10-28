/**
 * Follows one build live: its state and its log over server-sent events (`/api/builds/<id>/events`), resuming after a
 * dropped connection where the log left off (the browser sends Last-Event-ID). Where EventSource is missing it polls
 * the state instead. `now` ticks while the build runs, for the step timers.
 */
import { useEffect, useState } from 'react';
import { buildDetailSchema, buildEventsUrl, getBuild, type BuildDetail } from '../builds-api';
import type { Translate } from '../i18n';

/** Lines kept in the page; the full log stays downloadable. */
const MAX_LINES = 5_000;

export function isActive(detail: BuildDetail | null): boolean {
  return detail !== null && (detail.build.status === 'queued' || detail.build.status === 'running');
}

export interface FollowedBuild {
  readonly detail: BuildDetail | null;
  readonly lines: readonly string[];
  readonly now: number;
  /** Replaces the state (after "Báo tôi khi xong"). */
  readonly update: (detail: BuildDetail) => void;
}

export function useBuild(buildId: string | null, initial: BuildDetail | null = null): FollowedBuild {
  const [state, setDetail] = useState<BuildDetail | null>(initial);
  // Lines are kept with the build they belong to: following another build starts from an empty log.
  const [log, setLog] = useState<{ readonly id: string | null; readonly lines: readonly string[] }>({ id: buildId, lines: [] });
  const [now, setNow] = useState(() => Date.now());
  const detail = state && state.build.id === buildId ? state : null;
  const lines = log.id === buildId ? log.lines : [];

  useEffect(() => {
    if (!buildId) return;
    let live = true;
    if (typeof EventSource !== 'function') {
      const poll = (): void => {
        getBuild(buildId)
          .then((next) => {
            if (live) setDetail(next);
          })
          .catch((error: unknown) => console.warn('build poll failed', error instanceof Error ? error.message : String(error)));
      };
      poll();
      const timer = setInterval(poll, 2_000);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }
    const source = new EventSource(buildEventsUrl(buildId));
    const read = (event: Event): unknown => {
      try {
        return JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return null;
      }
    };
    source.addEventListener('state', (event) => {
      const parsed = buildDetailSchema.safeParse(read(event));
      if (live && parsed.success) setDetail(parsed.data);
    });
    source.addEventListener('log', (event) => {
      const data = read(event);
      const incoming = typeof data === 'object' && data !== null && Array.isArray((data as { lines?: unknown }).lines) ? (data as { lines: unknown[] }).lines.filter((l): l is string => typeof l === 'string') : [];
      if (live && incoming.length > 0) {
        setLog((before) => ({ id: buildId, lines: [...(before.id === buildId ? before.lines : []), ...incoming].slice(-MAX_LINES) }));
      }
    });
    source.addEventListener('end', () => source.close());
    return () => {
      live = false;
      source.close();
    };
  }, [buildId]);

  const running = isActive(detail);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [running]);

  return { detail, lines, now, update: setDetail };
}

/** "45 giây", "1 phút 20 giây". */
export function duration(t: Translate, ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return t('seconds', { n: total });
  return t('minutes', { m: Math.floor(total / 60), s: total % 60 });
}
