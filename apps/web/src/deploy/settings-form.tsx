/**
 * The build settings of a developer site: the fields (grouped: where the app is, then how it is built and what is
 * published), each checked as the developer leaves it, and for an existing site the panel that saves them on their own.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api';
import type { BuildSettings } from '../builds-api';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import {
  fieldText,
  MAX_COMMAND_LENGTH,
  MAX_DIR_LENGTH,
  sameSettings,
  serverSettingsErrors,
  SETTINGS_FIELDS,
  settingsErrors,
  withField,
  type SettingsErrors,
  type SettingsField,
} from './settings-checks';

const FIELD_COPY: Readonly<Record<SettingsField, { label: MessageKey; help: MessageKey; placeholder: MessageKey; dataId: string; maxLength: number }>> = {
  rootDir: { label: 'deploy.rootDir.label', help: 'deploy.rootDir.help', placeholder: 'deploy.rootDir.placeholder', dataId: 'settings-root', maxLength: MAX_DIR_LENGTH },
  buildCommand: { label: 'deploy.buildCommand.label', help: 'deploy.buildCommand.help', placeholder: 'deploy.buildCommand.placeholder', dataId: 'settings-command', maxLength: MAX_COMMAND_LENGTH },
  outputDir: { label: 'deploy.outputDir.label', help: 'deploy.outputDir.help', placeholder: 'deploy.outputDir.placeholder', dataId: 'settings-output', maxLength: MAX_DIR_LENGTH },
};

const GROUPS: readonly { legend: MessageKey; fields: readonly SettingsField[] }[] = [
  { legend: 'deploy.settings.group.source', fields: ['rootDir'] },
  { legend: 'deploy.settings.group.build', fields: ['buildCommand', 'outputDir'] },
];

/**
 * The editable settings: app folder, build command (empty: plain HTML), output folder. With `defaults` (what the check
 * recognized), each field says whether it is the recognized value or the developer's own, and can go back to it.
 */
export function SettingsFields({
  value,
  onChange,
  disabled,
  readOnly,
  defaults,
  errors,
  onLeave,
}: {
  readonly value: BuildSettings;
  readonly onChange: (next: BuildSettings) => void;
  readonly disabled?: boolean;
  /** While saving: the values stay readable and focusable, but cannot change. */
  readonly readOnly?: boolean;
  readonly defaults?: BuildSettings | null;
  readonly errors?: SettingsErrors;
  readonly onLeave?: (field: SettingsField) => void;
}): ReactNode {
  const { t } = useI18n();
  const ids: Readonly<Record<SettingsField, string>> = { rootDir: useId(), buildCommand: useId(), outputDir: useId() };
  return (
    <div className="settings-fields">
      {GROUPS.map((group) => (
        <fieldset key={group.legend} className="settings-group">
          <legend className="settings-legend">{t(group.legend)}</legend>
          {group.fields.map((field) => {
            const copy = FIELD_COPY[field];
            const id = ids[field];
            const error = errors?.[field];
            const typed = fieldText(value, field);
            const recognized = defaults ? fieldText(defaults, field) : null;
            const custom = recognized !== null && typed.trim() !== recognized.trim();
            return (
              <div key={field} className="field">
                <div className="field-head">
                  <label className="field-label" htmlFor={id}>
                    {t(copy.label)}
                  </label>
                  {recognized !== null ? (
                    <span className={custom ? 'setting-tag setting-tag-custom' : 'setting-tag'} data-id={`${copy.dataId}-tag`}>
                      {t(custom ? 'deploy.settings.custom' : 'deploy.settings.default')}
                    </span>
                  ) : null}
                </div>
                <input
                  id={id}
                  className="input input-mono"
                  value={typed}
                  onChange={(event) => onChange(withField(value, field, event.target.value))}
                  onBlur={() => onLeave?.(field)}
                  placeholder={t(copy.placeholder)}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={copy.maxLength}
                  disabled={disabled}
                  readOnly={readOnly}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error ${id}-help` : `${id}-help`}
                  data-id={copy.dataId}
                />
                {error ? (
                  <p id={`${id}-error`} className="field-error">
                    {t(error)}
                  </p>
                ) : null}
                <p id={`${id}-help`} className="hint">
                  {t(copy.help)}
                </p>
                {custom ? (
                  <p className="setting-default">
                    {t('deploy.settings.defaultValue', { value: recognized === '' ? t('deploy.settings.empty') : recognized })}
                    <button type="button" className="text-button" onClick={() => onChange(withField(value, field, recognized))} disabled={disabled || readOnly} data-id={`${copy.dataId}-reset`}>
                      {t('deploy.settings.reset')}
                    </button>
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

type SaveState = 'idle' | 'saving' | 'saved';

/**
 * The settings of an existing site, saved on their own (they apply from the next build): errors at their field, the
 * save button only when something changed, an undo, and a plain saved/unsaved line.
 */
export function SettingsPanel({
  initial,
  defaults,
  onSave,
}: {
  readonly initial: BuildSettings;
  readonly defaults: BuildSettings | null;
  /** Saves and answers the settings as the server keeps them. */
  readonly onSave: (settings: BuildSettings) => Promise<BuildSettings>;
}): ReactNode {
  const { t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const savedLine = useRef<HTMLParagraphElement>(null);
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [left, setLeft] = useState<ReadonlySet<SettingsField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<SettingsErrors>({});
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<MessageKey | null>(null);

  const local = settingsErrors(value);
  // A field's own mistake shows once the developer has left it (or tried to save); the server's always.
  const shown: SettingsErrors = Object.fromEntries(
    SETTINGS_FIELDS.flatMap((field) => {
      const key = serverErrors[field] ?? (submitted || left.has(field) ? local[field] : undefined);
      return key ? [[field, key]] : [];
    }),
  );
  const dirty = !sameSettings(value, saved);
  const saving = state === 'saving';

  // The server can change the settings on its own (a new zip before the first build follows what it finds): take
  // them as the saved values, and into the fields unless the developer is in the middle of a change.
  if (!sameSettings(seen, initial)) {
    setSeen(initial);
    setSaved(initial);
    if (!dirty) setValue(initial);
  }

  // Saving disables the button that had the focus: hand it to the line that says it is saved.
  useEffect(() => {
    if (state === 'saved') savedLine.current?.focus();
  }, [state]);

  const reset = (next: BuildSettings): void => {
    setValue(next);
    setState('idle');
    setError(null);
    setServerErrors({});
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitted(true);
    const invalid = SETTINGS_FIELDS.find((field) => local[field]);
    if (invalid) {
      setError('deploy.settings.invalid');
      form.current?.querySelector<HTMLInputElement>(`[data-id="${FIELD_COPY[invalid].dataId}"]`)?.focus();
      return;
    }
    setState('saving');
    setError(null);
    try {
      const kept = await onSave(value);
      setSaved(kept);
      setValue(kept);
      setLeft(new Set());
      setSubmitted(false);
      setState('saved');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'build-settings') setServerErrors(serverSettingsErrors(failure.fields));
      setError(errorMessage(failure));
      setState('idle');
    }
  };

  let status: ReactNode;
  if (state === 'saved' && !dirty) {
    status = (
      <p ref={savedLine} tabIndex={-1} className="settings-status settings-status-saved" role="status" data-id="settings-saved">
        {t('deploy.settings.saved')}
      </p>
    );
  } else if (dirty) {
    status = (
      <p className="settings-status settings-status-dirty" role="status">
        {t('deploy.settings.dirty')}
      </p>
    );
  } else {
    status = <p className="settings-status hint">{t('deploy.settings.help')}</p>;
  }

  return (
    <form ref={form} id="deploy-settings" className="panel" onSubmit={(event) => void submit(event)} aria-labelledby="settings-heading" noValidate data-id="deploy-settings">
      <h2 id="settings-heading" className="panel-title">
        {t('deploy.settings.title')}
      </h2>
      <SettingsFields
        value={value}
        defaults={defaults}
        errors={shown}
        readOnly={saving}
        onChange={reset}
        onLeave={(field) => setLeft((before) => new Set(before).add(field))}
      />
      {error ? (
        <p className="field-error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <div className="settings-footer">
        {status}
        <div className="settings-buttons">
          {dirty ? (
            <button type="button" className="pill pill-ghost pill-small" onClick={() => reset(saved)} disabled={saving} data-id="settings-undo">
              {t('deploy.settings.undo')}
            </button>
          ) : null}
          <button type="submit" className="pill pill-dark pill-small" disabled={!dirty || saving} aria-busy={saving} data-id="settings-save">
            {saving ? t('deploy.settings.saving') : t('deploy.settings.save')}
          </button>
        </div>
      </div>
    </form>
  );
}
