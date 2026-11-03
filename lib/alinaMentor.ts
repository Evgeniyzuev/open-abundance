/**
 * "Разберу лично твою ситуацию": a conversation with the AI mentor Alina Agitova (docs/mentors/ALINA_AGITOVA.md).
 *
 * Alina asks one question at a time and walks the person through five stages: where they are now, what they really
 * want, what has already worked for them, a first ten-minute step with a week plan, and saying goodbye until tomorrow.
 * A guest gets her greeting and first question without AI; the AI answers only after sign-in, so a guest costs nothing.
 * Pure and standalone (no imports) so tests and the route can share it.
 */

export const ALINA_STAGES = ["now", "wish", "strengths", "plan", "done"] as const;
export type AlinaStage = (typeof ALINA_STAGES)[number];

export type AlinaMessage = { role: "alina" | "person"; text: string };

export type AlinaReply = {
  text: string;
  stage: AlinaStage;
  /** A short wish title once the person has named what they want; the page offers to save it. */
  wish: string | null;
  /** The first small step, once agreed. */
  step: string | null;
};

export const ALINA_MAX_MESSAGE = 600;
export const ALINA_MAX_REPLY = 700;
/** Messages sent to the AI: the opening plus the recent turns are enough to keep the thread. */
export const ALINA_HISTORY_LIMIT = 24;
export const ALINA_DAY_LIMIT = 40;
export const ALINA_MONTH_LIMIT = 400;
export const ALINA_STORAGE_KEY = "oa.alina.chat.v1";
export const ALINA_RETURN_KEY = "oa.alina.returnAfterSignIn";

type Text = { ru: string; en: string };

export const ALINA_OPENING: Text[] = [
  {
    ru: "Привет! Я Алина. Рада, что ты заглянул(а) ко мне.",
    en: "Hi! I'm Alina. I'm glad you stopped by."
  },
  {
    ru: "Давай без спешки и без оценок. Расскажи, как ты сейчас? Что в твоей жизни сейчас тянет вниз или просто устало?",
    en: "No rush and no judgement. Tell me, how are you right now? What in your life is pulling you down, or just feels tired?"
  }
];

export const ALINA_SIGN_IN_NOTE: Text = {
  ru: "Спасибо, что поделился(ась). Я хочу ответить тебе по-настоящему и не потерять наш разговор. Войди, это займёт минуту, и я сразу продолжу с этого места.",
  en: "Thank you for sharing. I want to answer you properly and not lose our conversation. Sign in, it takes a minute, and I'll continue right from here."
};

export function openingMessages(locale: "ru" | "en"): AlinaMessage[] {
  return ALINA_OPENING.map((line) => ({ role: "alina", text: line[locale] }));
}

export function cleanAlinaText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+\n/g, "\n").trim().slice(0, max);
}

/** Keeps only well-formed turns, trimmed, the last ALINA_HISTORY_LIMIT of them. */
export function normalizeAlinaHistory(value: unknown): AlinaMessage[] {
  if (!Array.isArray(value)) return [];
  const rows = value
    .map((item) => {
      const role = (item as { role?: unknown })?.role;
      const text = cleanAlinaText((item as { text?: unknown })?.text, role === "alina" ? ALINA_MAX_REPLY : ALINA_MAX_MESSAGE);
      return (role === "alina" || role === "person") && text ? { role, text } as AlinaMessage : null;
    })
    .filter((item): item is AlinaMessage => item !== null);
  return rows.slice(-ALINA_HISTORY_LIMIT);
}

export function isAlinaStage(value: unknown): value is AlinaStage {
  return typeof value === "string" && (ALINA_STAGES as readonly string[]).includes(value);
}

export function normalizeAlinaReply(value: unknown): AlinaReply | null {
  const raw = value as { text?: unknown; stage?: unknown; wish?: unknown; step?: unknown } | null;
  const text = cleanAlinaText(raw?.text, ALINA_MAX_REPLY);
  if (!text) return null;
  const wish = cleanAlinaText(raw?.wish, 120) || null;
  const step = cleanAlinaText(raw?.step, 200) || null;
  return { text, stage: isAlinaStage(raw?.stage) ? raw.stage : "now", wish, step };
}

/** How many times the person has written; the guest gets one answer before signing in. */
export function personTurns(messages: AlinaMessage[]): number {
  return messages.filter((message) => message.role === "person").length;
}
