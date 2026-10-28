import { useId, type ReactNode } from 'react';

/** A labelled on/off choice, with a line on what it does. */
export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  dataId,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly dataId: string;
}): ReactNode {
  const id = useId();
  const hintId = useId();
  return (
    <div className="field toggle-field">
      <label className="toggle" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-describedby={hint ? hintId : undefined} data-id={dataId} />
        <span className="field-label">{label}</span>
      </label>
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
