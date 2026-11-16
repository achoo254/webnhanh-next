/**
 * Which templates take replies ("Xác nhận tham dự") through the reply form (`rsvp-form.ts`) when the draft's `rsvp`
 * is on, and show a countdown to their `date` that the worker renders again each day. No other import, so the app's
 * inbox can ask without bundling the renderers (`@webnhanh/templates/rsvp-templates`).
 */
export const RSVP_TEMPLATES = ['wedding', 'party'] as const;
export type RsvpTemplateId = (typeof RSVP_TEMPLATES)[number];

/** True when `template` is one whose page takes replies (its inbox lists replies, not orders). */
export function takesReplies(template: string | null | undefined): template is RsvpTemplateId {
  return typeof template === 'string' && (RSVP_TEMPLATES as readonly string[]).includes(template);
}
