// "Inbox from Nova": rules for personal messages to one person, shown as Nova's message in their chat.
// Pure (no I/O) so `pnpm test:nova-inbox` can check them. Sending happens only after the operator's approval.

export const NOVA_INBOX_DEEP_LINK = "/?view=home.ideas";
export const NOVA_INBOX_MIN_CHARS = 3;
export const NOVA_INBOX_MAX_CHARS = 800;
/** People per request; a bigger batch is a broadcast, not a personal message. */
export const NOVA_INBOX_MAX_RECIPIENTS = 20;
/** At most one message per person in this period, so Nova never becomes a spammer. */
export const NOVA_INBOX_COOLDOWN_MS = 3 * 86_400_000;
export const NOVA_INBOX_PUSH_CHARS = 120;

export type InboxSkipReason = "unknown_person" | "cooldown" | "duplicate";

export function normalizeInboxBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return body.length >= NOVA_INBOX_MIN_CHARS && body.length <= NOVA_INBOX_MAX_CHARS ? body : null;
}

/** First line of the message for the push, cut at a word. */
export function inboxPushText(body: string): string {
  const line = body.split("\n")[0].trim();
  if (line.length <= NOVA_INBOX_PUSH_CHARS) return line;
  const cut = line.slice(0, NOVA_INBOX_PUSH_CHARS - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trimEnd()}…`;
}

/**
 * Decides who gets the message. Recipients are pseudonyms from the analytics report (or user ids for a signed-in
 * operator); `resolve` maps them to user ids. `lastSentAt` is the newest inbox message per user id.
 */
export function planInboxSend(
  recipients: string[],
  resolve: (recipient: string) => string | null,
  lastSentAt: Map<string, number>,
  now: number
): { send: Array<{ recipient: string; userId: string }>; skipped: Array<{ recipient: string; reason: InboxSkipReason }> } {
  const send: Array<{ recipient: string; userId: string }> = [];
  const skipped: Array<{ recipient: string; reason: InboxSkipReason }> = [];
  const seen = new Set<string>();
  for (const recipient of recipients) {
    const userId = resolve(recipient);
    if (!userId) skipped.push({ recipient, reason: "unknown_person" });
    else if (seen.has(userId)) skipped.push({ recipient, reason: "duplicate" });
    else if (now - (lastSentAt.get(userId) ?? 0) < NOVA_INBOX_COOLDOWN_MS) skipped.push({ recipient, reason: "cooldown" });
    else {
      seen.add(userId);
      send.push({ recipient, userId });
    }
  }
  return { send, skipped };
}
