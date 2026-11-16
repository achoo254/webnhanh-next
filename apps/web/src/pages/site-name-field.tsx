import { checkSiteName } from '@webnhanh/db/site-name';
import { useId, useState, type ReactNode } from 'react';
import { SITES_DOMAIN } from '../brand';
import { useI18n, type MessageKey } from '../i18n';

const NAME_REASONS: Readonly<Record<'format' | 'reserved' | 'sensitive', MessageKey>> = {
  format: 'name.format',
  reserved: 'name.reserved',
  sensitive: 'name.sensitive',
};

/** The address being typed: checked as typed, plus the server's refusal (taken, limit...) until the next change. */
export interface SiteNameState {
  readonly name: string;
  readonly setName: (name: string) => void;
  /** The checked name when it is one a site can have, else null. */
  readonly valid: string | null;
  /** What to show under the field: the local check's reason first, else the server's. */
  readonly shown: MessageKey | null;
  readonly setError: (error: MessageKey | null) => void;
}

export function useSiteName(initial: string): SiteNameState {
  const [name, setNameValue] = useState(initial);
  const [error, setError] = useState<MessageKey | null>(null);
  const check = name.trim() === '' ? null : checkSiteName(name);
  const localError = check && !check.ok ? NAME_REASONS[check.reason] : null;
  return {
    name,
    setName: (value) => {
      setNameValue(value);
      setError(null);
    },
    valid: check?.ok ? check.name : null,
    shown: localError ?? error,
    setError,
  };
}

/**
 * The website's address: `<name>.<sites domain>`, with the rules or what is wrong with it under the field. It only
 * shows where the address is the next thing to type, so it takes the focus.
 */
export function SiteNameField({ field }: { readonly field: SiteNameState }): ReactNode {
  const { t } = useI18n();
  const inputId = useId();
  const helpId = useId();
  return (
    <>
      <label className="field-label" htmlFor={inputId}>
        {t('new.name.label')}
      </label>
      <div className="address-input">
        <input
          id={inputId}
          className="input"
          value={field.name}
          onChange={(event) => field.setName(event.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          maxLength={30}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-invalid={field.shown !== null}
          aria-describedby={helpId}
          data-id="new-name"
        />
        <span className="address-suffix">.{SITES_DOMAIN}</span>
      </div>
      <p id={helpId} className={field.shown ? 'field-error' : 'hint'} role={field.shown ? 'alert' : undefined}>
        {field.shown ? t(field.shown) : t('new.name.help')}
      </p>
    </>
  );
}
