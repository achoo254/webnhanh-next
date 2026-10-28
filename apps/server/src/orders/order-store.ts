/**
 * Storing what a visitor sent (an order, or a reply to a wedding invitation) with its notification deliveries (one
 * per push subscription of the owner, one for the owner's linked chat) in one transaction, so a submission never
 * exists without the notices it is owed. Channels the server has no keys for get no rows; the in-app inbox needs none
 * (an unhandled submission is the badge).
 */
import { randomUUID } from 'node:crypto';
import { chatLinks, notificationDeliveries, pushSubscriptions, submissions, type Db, type SubmissionContent } from '@webnhanh/db';
import { eq } from 'drizzle-orm';

export interface OrderChannels {
  readonly push: boolean;
  readonly chat: boolean;
}

export async function recordSubmission(
  db: Db,
  input: { siteId: string; accountId: string; content: SubmissionContent },
  channels: OrderChannels,
  now: Date,
): Promise<{ id: string; deliveries: number }> {
  return db.transaction(async (tx) => {
    const id = randomUUID();
    await tx.insert(submissions).values({ id, siteId: input.siteId, kind: input.content.kind, data: input.content.data, createdAt: now });
    const devices = channels.push
      ? await tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, input.accountId))
      : [];
    const [chat] = channels.chat ? await tx.select({ chatId: chatLinks.chatId }).from(chatLinks).where(eq(chatLinks.accountId, input.accountId)) : [];
    const targets = [
      ...devices.map((device) => ({ channel: 'push' as const, target: device.id })),
      ...(chat ? [{ channel: 'chat' as const, target: String(chat.chatId) }] : []),
    ];
    if (targets.length > 0) {
      await tx.insert(notificationDeliveries).values(
        targets.map((t) => ({ id: randomUUID(), submissionId: id, accountId: input.accountId, ...t, status: 'pending' as const, nextAttemptAt: now, createdAt: now })),
      );
    }
    return { id, deliveries: targets.length };
  });
}
