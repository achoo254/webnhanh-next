import type { ReactNode, RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '../i18n';

/** A field the publish check refused, or the issue of a whole list ("Cần ít nhất một món"). */
const ISSUE_SELECTOR = '[aria-invalid="true"], [data-issue="true"]';

/**
 * Brings the next refused field after `from` into view and focuses it (the first one when `from` is null or after the
 * last). Returns false when the editor shows none.
 */
export function focusIssue(root: HTMLElement | null, from: Element | null): boolean {
  const all = [...(root?.querySelectorAll<HTMLElement>(ISSUE_SELECTOR) ?? [])];
  if (all.length === 0) return false;
  const next = (from ? all.find((field) => field !== from && Boolean(from.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING)) : undefined) ?? all[0];
  if (!next) return false;
  next.scrollIntoView({ block: 'center', behavior: 'smooth' });
  next.focus({ preventScroll: true });
  return true;
}

/**
 * "Còn N ô cần điền…" under the editor once Publish was refused, with a button that walks through the refused fields
 * one by one (from the field being edited, so it never stops on the same one twice in a row).
 */
export function IssueSummary({
  count,
  editorRef,
  onShowForm,
}: {
  readonly count: number;
  readonly editorRef: RefObject<HTMLElement | null>;
  /** Shows the form (on a phone the Preview tab hides it): the fields must be on screen before one can take focus. */
  readonly onShowForm: () => void;
}): ReactNode {
  const { t } = useI18n();
  if (count === 0) return null;
  return (
    <div className="issue-summary" data-id="publish-issues-box">
      <p className="field-error" role="alert" data-id="publish-issues">
        {t('issue.summary', { count })}
      </p>
      <button
        type="button"
        className="pill pill-dark"
        // Keeps focus where it is until the click, so "next" counts from the field being edited.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          flushSync(onShowForm);
          const active = document.activeElement;
          focusIssue(editorRef.current, active && editorRef.current?.contains(active) ? active : null);
        }}
        data-id="publish-issues-next"
      >
        {t('issue.next')}
      </button>
    </div>
  );
}
