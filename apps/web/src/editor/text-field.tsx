import { useId, type ReactNode } from 'react';

/** A labelled text input or textarea with an optional hint and error, wired for screen readers. */
export function TextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  hint,
  error,
  multiline = false,
  inputMode,
  dataId,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength: number;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly multiline?: boolean;
  readonly inputMode?: 'text' | 'tel' | 'url';
  readonly dataId: string;
}): ReactNode {
  const id = useId();
  const noteId = useId();
  const note = error ?? hint;
  const common = {
    id,
    value,
    maxLength,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': note ? noteId : undefined,
    'data-id': dataId,
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea {...common} className="input textarea" rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...common} className="input" inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
      )}
      {note ? (
        <p id={noteId} className={error ? 'field-error' : 'hint'}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
