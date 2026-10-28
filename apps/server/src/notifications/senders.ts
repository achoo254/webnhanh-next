/**
 * What the delivery loop sends through: one sender per channel. A sender resolves `sent`, or `gone` when the target
 * no longer exists (expired push subscription, a chat that stopped the bot); it throws DeliveryError otherwise,
 * `permanent` when trying again cannot help.
 */
export type SendResult = 'sent' | 'gone';

export class DeliveryError extends Error {
  constructor(
    /** Stable code stored with the delivery (never a response body). */
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(code);
    this.name = 'DeliveryError';
  }
}

export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface PushSender {
  send(target: PushTarget, payload: string): Promise<SendResult>;
}

export interface ChatSender {
  /** `randomId` makes a retried send land once (the Bot API dedupes on it). */
  send(chatId: number, text: string, randomId: number): Promise<SendResult>;
}

export interface Senders {
  readonly push: PushSender | null;
  readonly chat: ChatSender | null;
}
