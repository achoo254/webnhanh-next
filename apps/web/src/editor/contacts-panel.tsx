import { CONTACT_LIMIT, type Contacts } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n, type MessageKey } from '../i18n';
import { PanelIssue } from './list-items';
import { TextField } from './text-field';

/** Zalo, phone and Facebook of the page's owner: each one filled in becomes a button on the page. */
export function ContactsPanel({
  contacts,
  onChange,
  issueText,
  title = 'editor.contacts',
  help = 'editor.contacts.help',
  children,
}: {
  readonly contacts: Contacts;
  readonly onChange: (contacts: Contacts) => void;
  readonly issueText: (field: string) => string | null;
  readonly title?: MessageKey;
  readonly help?: MessageKey;
  /** Shown above the fields (the switch of what the contacts are for). */
  readonly children?: ReactNode;
}): ReactNode {
  const { t } = useI18n();
  return (
    <section className="panel" aria-labelledby="contacts-heading">
      <h2 id="contacts-heading" className="panel-title">
        {t(title)}
      </h2>
      <p className="hint">{t(help)}</p>
      {children}
      <PanelIssue text={issueText('contacts')} />
      <TextField
        label={t('editor.zalo')}
        value={contacts.zalo}
        onChange={(zalo) => onChange({ ...contacts, zalo })}
        maxLength={CONTACT_LIMIT}
        inputMode="tel"
        error={issueText('contacts.zalo')}
        dataId="contact-zalo"
      />
      <TextField
        label={t('editor.phone')}
        value={contacts.phone}
        onChange={(phone) => onChange({ ...contacts, phone })}
        maxLength={CONTACT_LIMIT}
        inputMode="tel"
        error={issueText('contacts.phone')}
        dataId="contact-phone"
      />
      <TextField
        label={t('editor.facebook')}
        value={contacts.facebook}
        onChange={(facebook) => onChange({ ...contacts, facebook })}
        maxLength={CONTACT_LIMIT}
        inputMode="url"
        error={issueText('contacts.facebook')}
        dataId="contact-facebook"
      />
    </section>
  );
}
