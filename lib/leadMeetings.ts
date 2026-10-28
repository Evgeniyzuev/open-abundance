// Meetings with the lead (Evgen, 2026-10-27): a two-minute check-in in the app, like a coach's short session.
// The lead sees what moved since the last meeting, asks how the goal went and whether there is a question or wish,
// and the person sets one goal for the next meeting. The person picks the rhythm: every day, three times a week
// (Mon, Wed, Fri) or once a week (Monday). The lead proposes the rhythm from the person's motive and pace (Evgen,
// 2026-10-28: the lead serves the person, not the other way round); the person can take it or pick another. Nova invites
// on meeting days, and the person answers whenever they have time: a meeting stays open until the next meeting day.
// After two invitations in a row without a meeting she only invites on Mondays, so nobody is chased. Pure and standalone.

const DAY_MS = 86_400_000;

export const MEETING_RHYTHMS = ["daily", "three", "weekly", "off"] as const;
export type MeetingRhythm = (typeof MEETING_RHYTHMS)[number];
export const MEETING_GOAL_STATUSES = ["done", "partly", "not_yet"] as const;
export type MeetingGoalStatus = (typeof MEETING_GOAL_STATUSES)[number];

export const MEETING_TEXT_MAX = 300;
/** Invitations in a row without a meeting, after which Nova invites only on Mondays. */
export const MEETING_BACKOFF_AFTER = 2;

type Copy = { title: string; body: string; button: string };
type LocalizedCopy = { en: Copy; ru?: Copy };

export function isMeetingRhythm(value: unknown): value is MeetingRhythm {
  return (MEETING_RHYTHMS as readonly unknown[]).includes(value);
}

/** Day of week, Monday = 0, in UTC. */
function weekday(now: number): number {
  return (new Date(now).getUTCDay() + 6) % 7;
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isMeetingDay(rhythm: MeetingRhythm, now: number): boolean {
  if (rhythm === "daily") return true;
  if (rhythm === "three") return [0, 2, 4].includes(weekday(now));
  if (rhythm === "weekly") return weekday(now) === 0;
  return false;
}

/** The latest meeting day on or before today (YYYY-MM-DD), or null when meetings are off. */
export function currentMeetingDay(rhythm: MeetingRhythm | null, now: number): string | null {
  if (!rhythm || rhythm === "off") return null;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = now - offset * DAY_MS;
    if (isMeetingDay(rhythm, day)) return dayKey(day);
  }
  return null;
}

/**
 * A meeting is due when there was none since the latest meeting day. It stays open until the next meeting day, so the
 * person can answer in their own free time.
 */
export function isMeetingDue(rhythm: MeetingRhythm | null, lastMeetingDay: string | null, now: number): boolean {
  const current = currentMeetingDay(rhythm, now);
  if (!current) return false;
  return !lastMeetingDay || lastMeetingDay < current;
}

export type RhythmSuggestion = { rhythm: Exclude<MeetingRhythm, "off">; reason: "fast" | "steady" | "light" };

/**
 * The rhythm the lead proposes: every day for someone already moving fast (3+ quests in a week), three times a week
 * for a steady pace or a strong motive, once a week otherwise, so the first proposal never asks too much.
 */
export function suggestMeetingRhythm(input: { motive: string | null; questsLast7: number }): RhythmSuggestion {
  if (input.questsLast7 >= 3) return { rhythm: "daily", reason: "fast" };
  if (input.questsLast7 >= 1 || input.motive === "income" || input.motive === "change") return { rhythm: "three", reason: "steady" };
  return { rhythm: "weekly", reason: "light" };
}

/** The next meeting day after today (YYYY-MM-DD), or null when meetings are off. */
export function nextMeetingDay(rhythm: MeetingRhythm | null, now: number): string | null {
  if (!rhythm || rhythm === "off") return null;
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = now + offset * DAY_MS;
    if (isMeetingDay(rhythm, day)) return dayKey(day);
  }
  return null;
}

export type MeetingInviteInput = {
  rhythm: MeetingRhythm | null;
  lastMeetingDay: string | null;
  /** Why the person came (quest motive): income, wish, learn, change, ... */
  motive: string | null;
  /** The goal set at the last meeting, if any. */
  lastGoal: string | null;
};

export type MeetingSend = { step: string; at: number };

const MOTIVE_LINE: Record<string, { ru: string; en: string }> = {
  income: { ru: "Каждый шаг двигает тебя к своему доходу.", en: "Every step moves you toward your own income." },
  wish: { ru: "Каждый шаг приближает твоё желание.", en: "Every step brings your wish closer." },
  learn: { ru: "Каждый шаг это новый навык.", en: "Every step is a new skill." },
  change: { ru: "Маленькие шаги и есть перемены.", en: "Small steps are what change is made of." }
};

const DEFAULT_LINE = { ru: "Две минуты, и у тебя ясный шаг на завтра.", en: "Two minutes, and you have a clear step for tomorrow." };

export const MEETING_DEEP_LINK = "/?view=home";

/** The invitation text, shaped by the person's motive and the goal from the last meeting. */
export function meetingInviteCopy(input: Pick<MeetingInviteInput, "motive" | "lastGoal">): LocalizedCopy {
  const line = (input.motive && MOTIVE_LINE[input.motive]) || DEFAULT_LINE;
  const goal = input.lastGoal?.trim();
  return {
    ru: {
      title: "{name}, время нашей встречи",
      body: goal ? `В прошлый раз цель была «${goal}». Как прошло? ${line.ru} Ответь, когда будет время. Нова` : `Посмотрим, что сдвинулось, и поставим цель к следующей встрече. ${line.ru} Ответь, когда будет время. Нова`,
      button: "На встречу"
    },
    en: {
      title: "{name}, time for our meeting",
      body: goal ? `Last time the goal was "${goal}". How did it go? ${line.en} Answer whenever you have time. Nova` : `Let's look at what moved and set a goal for the next meeting. ${line.en} Answer whenever you have time. Nova`,
      button: "Join the meeting"
    }
  };
}

/** Invitations sent since the last meeting (the back-off counter). */
export function invitesSinceMeeting(sends: MeetingSend[], lastMeetingAt: number | null): number {
  return sends.filter((send) => send.step === "lead_meeting" && (lastMeetingAt === null || send.at > lastMeetingAt)).length;
}

/**
 * Whether Nova invites to a meeting now: only for people who chose a rhythm, on a due day, once a day, and after
 * MEETING_BACKOFF_AFTER unanswered invitations only on Mondays.
 */
export function shouldInviteToMeeting(input: MeetingInviteInput, sends: MeetingSend[], lastMeetingAt: number | null, now: number): boolean {
  if (!input.rhythm || !isMeetingDay(input.rhythm, now) || !isMeetingDue(input.rhythm, input.lastMeetingDay, now)) return false;
  if (sends.some((send) => send.step === "lead_meeting" && dayKey(send.at) === dayKey(now))) return false;
  if (invitesSinceMeeting(sends, lastMeetingAt) >= MEETING_BACKOFF_AFTER && weekday(now) !== 0) return false;
  return true;
}

/** A ready message for the Nova chat after the meeting, so she can answer the question and sharpen the goal. */
export function meetingChatPrompt(input: { progress: string[]; lastGoal: string | null; status: MeetingGoalStatus | null; question: string; nextGoal: string }, locale: string): string {
  const ru = locale === "ru";
  const statusText = input.status ? (ru ? { done: "сделал", partly: "частично", not_yet: "пока нет" } : { done: "done", partly: "partly", not_yet: "not yet" })[input.status] : null;
  const lines = [
    ru ? "Наша встреча." : "Our meeting.",
    input.progress.length ? `${ru ? "Что сдвинулось" : "What moved"}: ${input.progress.join("; ")}.` : "",
    input.lastGoal ? `${ru ? "Прошлая цель" : "Last goal"}: ${input.lastGoal}${statusText ? ` (${statusText})` : ""}.` : "",
    input.question ? `${ru ? "Мой вопрос" : "My question"}: ${input.question}` : "",
    input.nextGoal ? `${ru ? "Цель к следующей встрече" : "Goal for the next meeting"}: ${input.nextGoal}` : "",
    ru ? "Ответь на вопрос и помоги сделать цель маленькой и понятной. Без давления." : "Answer my question and help make the goal small and clear. No pressure."
  ];
  return lines.filter(Boolean).join("\n");
}
