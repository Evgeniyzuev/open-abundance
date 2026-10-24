// Second-day message from the Open Abundance bot to everyone with a linked Telegram account (founder decision
// 2026-10-24: on by default). The text is the coordinator's "tasks for today" (variant A, up to $10), see
// lib/coordinatorNextStep.ts. Pure planning, no imports, so `pnpm test:telegram-day2` can check it.

export const DAY2_EVENT = "telegram_day2_sent";
export const DAY2_MIN_AGE_MS = 24 * 3_600_000;
/** After this the "second day" has passed; older accounts never get it, so turning it on does not spam everyone. */
export const DAY2_MAX_AGE_MS = 72 * 3_600_000;
/** Where the button opens: the challenges screen in the Mini App. TELEGRAM_DAY2_LINK swaps it for a plain link. */
export const DAY2_DEEP_LINK = "/?view=challenges";

export type Day2Candidate = { userId: string; telegramId: number | string; registeredAt: string; timezone: string | null; locale: string | null; name: string | null };

/**
 * Who gets the message in this run: registered 24-72 hours ago, never sent before, not switched "Reminders" off, no
 * other coordinator message in the last day (`messagedRecently`, one message a day), and it is daytime for them now
 * (`isSendTime`, the same window as other coordinator messages).
 */
export function planDay2(
  candidates: Day2Candidate[],
  alreadySent: Set<string>,
  remindersOff: Set<string>,
  messagedRecently: Set<string>,
  isSendTime: (timezone: string | null, now: number) => boolean,
  now: number
): Day2Candidate[] {
  return candidates.filter((candidate) => {
    const age = now - Date.parse(candidate.registeredAt);
    return age >= DAY2_MIN_AGE_MS
      && age < DAY2_MAX_AGE_MS
      && !alreadySent.has(candidate.userId)
      && !remindersOff.has(candidate.userId)
      && !messagedRecently.has(candidate.userId)
      && isSendTime(candidate.timezone, now);
  });
}
