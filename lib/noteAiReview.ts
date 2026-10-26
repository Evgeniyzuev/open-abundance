/**
 * Shared contract for the AI review of one note (no imports, tested directly by node).
 * The person picks how to review a note; "support" and "discuss" open the Nova chat right away, the rest go to a
 * queue: a quick review is answered at once by the AI gateway, a deep one by Claude in the daily procedure.
 * The note text is copied to the server only for the request and is erased once the answer is delivered.
 */

export const NOTE_AI_QUEUE_ACTIONS = ["sort", "advice", "plan", "tasks", "links"] as const;
export type NoteAiQueueAction = (typeof NOTE_AI_QUEUE_ACTIONS)[number];
export const NOTE_AI_CHAT_ACTIONS = ["support", "discuss"] as const;
export type NoteAiChatAction = (typeof NOTE_AI_CHAT_ACTIONS)[number];
export type NoteAiAction = NoteAiQueueAction | NoteAiChatAction;
export const NOTE_AI_MODES = ["quick", "deep"] as const;
export type NoteAiMode = (typeof NOTE_AI_MODES)[number];
export const NOTE_KINDS = ["task", "wish", "idea", "observation", "feeling"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const MAX_NOTE_AI_TEXT = 4_000;
export const MAX_NOTE_AI_CONTEXT = 6_000;
export const MAX_LINK_NOTES = 15;
export const DEEP_REVIEWS_PER_DAY = 3;

export type NoteAiResult = {
  /** The answer in plain words. */
  text: string;
  /** What the note is, when the AI could tell. */
  kind?: NoteKind;
  /** Steps of a plan or tasks to create; the person ticks which ones become tasks. */
  items?: string[];
  /** A list the note fits, by its title (sort). */
  list?: string;
  /** At most one optional follow-up question, shown inside the answer. */
  question?: string;
};

export type NoteAiReview = {
  requestId?: string;
  status: "pending" | "ready" | "failed";
  mode: NoteAiMode;
  action: NoteAiQueueAction;
  requestedAt: string;
  answeredAt?: string;
  result?: NoteAiResult;
  /** The person opened the answer. */
  seen?: boolean;
  /** How the person rated the answer: a 1–5 smiley and tags from lib/aiPreferences.ts. */
  feedback?: { rating: 1 | 2 | 3 | 4 | 5; tags: string[] };
  /** The person folded the answer away; it stays on the device and can be shown again. */
  hidden?: boolean;
};

export function isQueueAction(value: unknown): value is NoteAiQueueAction {
  return NOTE_AI_QUEUE_ACTIONS.includes(value as NoteAiQueueAction);
}

export function isNoteAiMode(value: unknown): value is NoteAiMode {
  return NOTE_AI_MODES.includes(value as NoteAiMode);
}

function cleanLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Cleans an answer from the model or from Claude: plain text, a few short items, known kind only. */
export function normalizeNoteAiResult(value: unknown): NoteAiResult | null {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;
  const text = typeof raw.text === "string" ? raw.text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1_500) : "";
  if (text.length < 2) return null;
  const result: NoteAiResult = { text };
  const kind = NOTE_KINDS.find((candidate) => candidate === raw.kind);
  if (kind) result.kind = kind;
  if (Array.isArray(raw.items)) {
    const seen = new Set<string>();
    const items = raw.items.map((item) => cleanLine(item, 140)).filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 7);
    if (items.length) result.items = items;
  }
  const list = cleanLine(raw.list, 60);
  if (list) result.list = list;
  const question = cleanLine(raw.question, 200);
  if (question) result.question = question;
  return result;
}

/**
 * Rough type of a note from its words, without AI. Only orders the menu: a feeling puts "support" first,
 * a task puts "tasks" first. Russian and English.
 */
export function guessNoteKind(text: string): NoteKind {
  const value = text.toLowerCase();
  if (/(груст|тревож|страш|боюсь|обид|злюсь|устал|одинок|плак|рад[аоу]? |счастлив|sad|anxious|afraid|scared|angry|tired|lonely|happy|upset|feel)/.test(value)) return "feeling";
  if (/(хочу|мечта|мечтаю|когда-нибудь|want|wish|dream|someday)/.test(value)) return "wish";
  if (/(идея|а что если|можно было бы|idea|what if|could)/.test(value)) return "idea";
  if (/(^|\s)(позвонить|купить|написать|сделать|оплатить|записаться|отправить|забрать|call|buy|write|pay|send|book|fix)(\s|$)/.test(value)) return "task";
  return "observation";
}

/** Menu order for a note: the most fitting choices first. */
export function orderNoteAiActions(kind: NoteKind): NoteAiAction[] {
  if (kind === "feeling") return ["support", "discuss", "advice", "sort", "plan", "tasks", "links"];
  if (kind === "task") return ["tasks", "plan", "sort", "discuss", "advice", "support", "links"];
  if (kind === "wish") return ["plan", "tasks", "discuss", "advice", "sort", "links", "support"];
  if (kind === "idea") return ["discuss", "advice", "plan", "links", "sort", "tasks", "support"];
  return ["sort", "discuss", "advice", "links", "plan", "tasks", "support"];
}

/** The prompt that opens the Nova chat for "support" and "discuss"; the person still presses Send. */
export function buildNoteChatPrompt(action: NoteAiChatAction, text: string, locale: string): string {
  const note = text.trim().slice(0, 1_200);
  if (locale === "ru") {
    return action === "support"
      ? `Поддержи меня, пожалуйста. Без советов, пока я не попрошу. Вот моя заметка:\n«${note}»`
      : `Давай обсудим мою заметку:\n«${note}»`;
  }
  return action === "support"
    ? `Please support me. No advice unless I ask for it. Here is my note:\n"${note}"`
    : `Let's talk about my note:\n"${note}"`;
}
