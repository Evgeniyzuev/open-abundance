"use client";

import { useEffect, useState } from "react";
import { Bot, Hourglass, Sparkles, X } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { OPEN_AI_PROMPT_EVENT, requestNoteAiReview, type NoteAiRequestFailure } from "@/lib/noteAiClient";
import { AI_FEEDBACK_PAIRS, buildPreferenceKeys, type AiFeedbackTag } from "@/lib/aiPreferences";
import { AI_PREFERENCES_CHANGED_EVENT, readAiFeedback, recordAiFeedback, removeAiFeedback, resetAiFeedback } from "@/lib/aiPreferencesStore";
import { trackProductEvent } from "@/lib/productAnalytics";
import {
  buildNoteChatPrompt,
  DEEP_REVIEWS_PER_DAY,
  guessNoteKind,
  orderNoteAiActions,
  type NoteAiAction,
  type NoteAiChatAction,
  type NoteAiMode
} from "@/lib/noteAiReview";
import { setNoteAiReview, type Note } from "@/lib/notesStore";

const ACTION_KEYS: Record<NoteAiAction, { title: MessageKey; hint: MessageKey }> = {
  support: { title: "notes.ai.action.support", hint: "notes.ai.hint.support" },
  discuss: { title: "notes.ai.action.discuss", hint: "notes.ai.hint.discuss" },
  sort: { title: "notes.ai.action.sort", hint: "notes.ai.hint.sort" },
  advice: { title: "notes.ai.action.advice", hint: "notes.ai.hint.advice" },
  plan: { title: "notes.ai.action.plan", hint: "notes.ai.hint.plan" },
  tasks: { title: "notes.ai.action.tasks", hint: "notes.ai.hint.tasks" },
  links: { title: "notes.ai.action.links", hint: "notes.ai.hint.links" }
};

const FAILURE_KEYS: Record<NoteAiRequestFailure, MessageKey> = {
  offline: "notes.ai.fail.offline",
  signin: "ai.tools.signIn",
  quota: "ai.tools.quota",
  deep_limit: "notes.ai.fail.deepLimit",
  not_ready: "notes.ai.fail.notReady",
  error: "notes.ai.fail.error"
};

function isChatAction(action: NoteAiAction): action is NoteAiChatAction {
  return action === "support" || action === "discuss";
}

/**
 * "How should AI review this note?": a few ready choices instead of questions. Support and discuss open the
 * Nova chat at once; the rest are queued (quick: Nova answers in a minute, deep: the AI assistant, within a day),
 * and the person can close the window right away.
 */
export function NoteAiMenu({ note, listTitles, onClose, onQueued, onChat }: {
  note: Note;
  listTitles: string[];
  onClose: () => void;
  onQueued: (message: string) => void;
  onChat: () => void;
}) {
  const { locale, t } = useUserContext();
  const [mode, setMode] = useState<NoteAiMode>("quick");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<NoteAiRequestFailure | null>(null);
  const actions = orderNoteAiActions(guessNoteKind(`${note.title}\n${note.body}`));

  async function choose(action: NoteAiAction) {
    if (busy) return;
    if (isChatAction(action)) {
      onChat();
      window.dispatchEvent(new CustomEvent(OPEN_AI_PROMPT_EVENT, { detail: { text: buildNoteChatPrompt(action, `${note.title}\n${note.body}`.trim(), locale) } }));
      return;
    }
    setBusy(true);
    setFailure(null);
    // The request runs on after the window closes; the note shows ⏳ until the answer arrives.
    const pending = requestNoteAiReview({ note, mode, action, locale, listTitles });
    onQueued(t("notes.ai.queued"));
    const outcome = await pending;
    if (!outcome.ok) {
      setBusy(false);
      setFailure(outcome.reason);
      onQueued(t(FAILURE_KEYS[outcome.reason]));
    }
  }

  return (
    <Sheet bare className="small notes-ai-menu" ariaLabel={t("notes.ai.menuTitle")} closeLabel={t("app.common.close")} onClose={onClose}>
      <h2>{t("notes.ai.menuTitle")}</h2>
      <section className="notes-ai-section">
        <h3>{t("notes.ai.now")}</h3>
        {actions.filter(isChatAction).map((action) => (
          <ActionButton key={action} action={action} disabled={busy} onChoose={choose} />
        ))}
      </section>
      <section className="notes-ai-section">
        <h3>{t("notes.ai.later")}</h3>
        <div className="notes-ai-mode" role="radiogroup" aria-label={t("notes.ai.modeLabel")}>
          {(["quick", "deep"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>
              {value === "quick" ? <Sparkles size={15} aria-hidden="true" /> : <Bot size={15} aria-hidden="true" />}
              <span>
                <strong>{t(value === "quick" ? "notes.ai.mode.quick" : "notes.ai.mode.deep")}</strong>
                <small>{value === "quick" ? t("notes.ai.mode.quickHint") : t("notes.ai.mode.deepHint", { count: DEEP_REVIEWS_PER_DAY })}</small>
              </span>
            </button>
          ))}
        </div>
        {actions.filter((action) => !isChatAction(action)).map((action) => (
          <ActionButton key={action} action={action} disabled={busy} onChoose={choose} />
        ))}
      </section>
      {failure ? <p className="notes-ai-error" role="alert">{t(FAILURE_KEYS[failure])}</p> : null}
      <AiPreferencesInfo />
    </Sheet>
  );
}

function ActionButton({ action, disabled, onChoose }: { action: NoteAiAction; disabled: boolean; onChoose: (action: NoteAiAction) => void }) {
  const { t } = useUserContext();
  return (
    <button className="notes-ai-choice" type="button" disabled={disabled} onClick={() => void onChoose(action)}>
      <strong>{t(ACTION_KEYS[action].title)}</strong>
      <small>{t(ACTION_KEYS[action].hint)}</small>
    </button>
  );
}

/** The AI button on a note row: AI, ⏳ while waiting, ✨ when a new answer is waiting to be read. */
export function NoteAiBadge({ note, onClick }: { note: Note; onClick: () => void }) {
  const { t } = useUserContext();
  const review = note.aiReview;
  const state = review?.status === "pending" ? "pending" : review?.status === "ready" && !review.seen ? "ready" : "idle";
  return (
    <button className={`notes-ai-button ${state}`} type="button" aria-label={t(state === "pending" ? "notes.ai.pendingLabel" : state === "ready" ? "notes.ai.readyLabel" : "notes.aiLabel")} onClick={onClick}>
      {state === "pending" ? <Hourglass size={14} aria-hidden="true" /> : state === "ready" ? <Sparkles size={14} aria-hidden="true" /> : "AI"}
    </button>
  );
}

/** The answer inside the note: text, optional checklist of tasks or steps, and one-tap follow-ups. */
export function NoteAiAnswer({ note, moveTarget, onMove, onCreateTasks, onAddWish, onAgain, onReviewAgain }: {
  note: Note;
  /** A list the answer suggested that exists on this device, if any. */
  moveTarget?: { id: string; title: string };
  onMove: (listId: string) => void;
  onCreateTasks: (items: string[]) => Promise<void>;
  onAddWish: () => Promise<void>;
  onAgain: () => void;
  /** Repeats the same review with the person's clarification; returns why it failed, if it did. */
  onReviewAgain: (addition: string) => Promise<NoteAiRequestFailure | null>;
}) {
  const { t } = useUserContext();
  const review = note.aiReview;
  const [checked, setChecked] = useState<Set<number>>(() => new Set((review?.result?.items ?? []).map((_, index) => index)));
  const [done, setDone] = useState<string | null>(null);
  if (!review) return null;

  if (review.status === "pending") {
    return (
      <section className="notes-ai-answer pending" aria-live="polite">
        <Hourglass size={18} aria-hidden="true" />
        <p>{t("notes.ai.queued")} {t(review.mode === "deep" ? "notes.ai.mode.deepHint" : "notes.ai.mode.quickHint", { count: DEEP_REVIEWS_PER_DAY })}</p>
      </section>
    );
  }
  if (review.status === "failed" || !review.result) {
    return (
      <section className="notes-ai-answer failed">
        <p>{t("notes.ai.fail.error")}</p>
        <div className="notes-ai-answer-actions">
          <button type="button" onClick={onAgain}>{t("notes.ai.again")}</button>
          <button type="button" onClick={() => void setNoteAiReview(note.id, undefined)}>{t("notes.ai.hide")}</button>
        </div>
      </section>
    );
  }

  const { result } = review;
  const items = result.items ?? [];
  return (
    <section className="notes-ai-answer">
      <header>
        <Sparkles size={16} aria-hidden="true" />
        <strong>{t(review.mode === "deep" ? "notes.ai.fromAssistant" : "notes.ai.fromNova")}</strong>
      </header>
      <p className="notes-ai-answer-text">{result.text}</p>
      {items.length > 0 ? (
        <ul className="notes-ai-items">
          {items.map((item, index) => (
            <li key={item}>
              <label>
                <input type="checkbox" checked={checked.has(index)} onChange={() => setChecked((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                })} />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {result.question ? <p className="notes-ai-question">{result.question}</p> : null}
      {done ? <p className="notes-ai-done" role="status">{done}</p> : null}
      <div className="notes-ai-answer-actions">
        {items.length > 0 ? (
          <button type="button" className="primary" disabled={checked.size === 0} onClick={() => void onCreateTasks(items.filter((_, index) => checked.has(index))).then(() => setDone(t("notes.ai.tasksCreated", { count: checked.size })))}>
            {t("notes.ai.createTasks", { count: checked.size })}
          </button>
        ) : null}
        {moveTarget ? <button type="button" onClick={() => { onMove(moveTarget.id); setDone(t("notes.ai.moved", { title: moveTarget.title })); }}>{t("notes.ai.moveTo", { title: moveTarget.title })}</button> : null}
        {result.kind === "wish" ? <button type="button" onClick={() => void onAddWish().then(() => setDone(t("notes.ai.wishAdded")), () => setDone(t("notes.ai.fail.error")))}>{t("notes.ai.addWish")}</button> : null}
        <button type="button" onClick={onAgain}>{t("notes.ai.again")}</button>
        <button type="button" aria-label={t("notes.ai.hide")} onClick={() => void setNoteAiReview(note.id, undefined)}><X size={14} aria-hidden="true" /></button>
      </div>
      <NoteAiFeedback note={note} onReviewAgain={onReviewAgain} />
    </section>
  );
}

const RATING_FACES = ["😕", "🙁", "😐", "🙂", "🤩"] as const;
const TAG_KEYS: Record<AiFeedbackTag, MessageKey> = {
  on_topic: "ai.feedback.tag.on_topic",
  off_topic: "ai.feedback.tag.off_topic",
  good_option: "ai.feedback.tag.good_option",
  generic: "ai.feedback.tag.generic",
  my_tone: "ai.feedback.tag.my_tone",
  not_my_tone: "ai.feedback.tag.not_my_tone",
  shorter: "ai.feedback.tag.shorter",
  more_detail: "ai.feedback.tag.more_detail"
};

/**
 * Rating of an answer: the same smileys as in the Nova chat, then tags by aspect (topic, use, tone, length) and a
 * clarification for a repeated review. Ratings stay on the device and shape later answers; analytics gets only the
 * rating, the tags and the kind of review.
 */
function NoteAiFeedback({ note, onReviewAgain }: { note: Note; onReviewAgain: (addition: string) => Promise<NoteAiRequestFailure | null> }) {
  const { t } = useUserContext();
  const review = note.aiReview;
  const [addition, setAddition] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<NoteAiRequestFailure | null>(null);
  if (!review) return null;
  const feedback = review.feedback;
  const ref = `note:${review.requestId ?? `${note.id}:${review.requestedAt}`}`;

  function save(next: NonNullable<typeof feedback> | undefined) {
    if (!review) return;
    void setNoteAiReview(note.id, { ...review, feedback: next });
    if (!next) {
      removeAiFeedback(ref);
      return;
    }
    recordAiFeedback({ at: new Date().toISOString(), rating: next.rating, tags: next.tags as AiFeedbackTag[], source: "note", ref });
    trackProductEvent("note_ai_rated", { mode: review.mode, action: review.action, rating: next.rating, tags: next.tags.join(",") || null });
  }

  function toggleTag(tag: AiFeedbackTag) {
    if (!feedback) return;
    const pair = AI_FEEDBACK_PAIRS.find((item) => item.includes(tag)) ?? [tag, tag];
    const tags = feedback.tags.includes(tag)
      ? feedback.tags.filter((item) => item !== tag)
      : [...feedback.tags.filter((item) => !pair.includes(item as AiFeedbackTag)), tag];
    save({ ...feedback, tags });
  }

  async function sendAddition() {
    if (!addition.trim() || sending) return;
    setSending(true);
    setFailure(null);
    const result = await onReviewAgain(addition.trim());
    setSending(false);
    if (result) setFailure(result);
    else setAddition("");
  }

  return (
    <div className="notes-ai-feedback">
      <div className="ai-msg-rating notes-ai-rating" role="group" aria-label={t("ai.chat.rating.label")}>
        {RATING_FACES.map((face, index) => {
          const rating = (index + 1) as 1 | 2 | 3 | 4 | 5;
          return (
            <button key={rating} type="button" className={feedback?.rating === rating ? "is-selected" : ""} aria-pressed={feedback?.rating === rating} aria-label={`${t("ai.chat.rating.option", { rating })}: ${t(`ai.chat.rating.${rating}` as MessageKey)}`} onClick={() => save(feedback?.rating === rating ? undefined : { rating, tags: feedback?.tags ?? [] })}>
              {face}
            </button>
          );
        })}
      </div>
      {feedback ? (
        <>
          <div className="notes-ai-tags">
            {AI_FEEDBACK_PAIRS.flat().map((tag) => (
              <button key={tag} type="button" className={feedback.tags.includes(tag) ? "active" : ""} aria-pressed={feedback.tags.includes(tag)} onClick={() => toggleTag(tag)}>{t(TAG_KEYS[tag])}</button>
            ))}
          </div>
          <div className="notes-ai-addition">
            <textarea rows={2} maxLength={600} aria-label={t("ai.feedback.additionLabel")} placeholder={t("ai.feedback.additionPlaceholder")} value={addition} onChange={(event) => setAddition(event.target.value)} />
            <button type="button" disabled={!addition.trim() || sending} onClick={() => void sendAddition()}>{t("ai.feedback.reviewAgain")}</button>
          </div>
          {failure ? <p className="notes-ai-error" role="alert">{t(FAILURE_KEYS[failure])}</p> : null}
        </>
      ) : null}
    </div>
  );
}

const PREFERENCE_KEYS: Record<ReturnType<typeof buildPreferenceKeys>[number], MessageKey> = {
  brief: "ai.prefs.brief",
  detailed: "ai.prefs.detailed",
  concrete: "ai.prefs.concrete",
  stay_on_topic: "ai.prefs.stay_on_topic",
  keep_tone: "ai.prefs.keep_tone",
  change_tone: "ai.prefs.change_tone",
  new_approach: "ai.prefs.new_approach"
};

/** "How AI uses your ratings": the instructions that go with every answer now, and a reset. */
export function AiPreferencesInfo() {
  const { t } = useUserContext();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(() => (typeof window === "undefined" ? [] : readAiFeedback()));
  useEffect(() => {
    const refresh = () => setEntries(readAiFeedback());
    window.addEventListener(AI_PREFERENCES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(AI_PREFERENCES_CHANGED_EVENT, refresh);
  }, []);
  const keys = buildPreferenceKeys(entries);
  return (
    <section className="notes-ai-prefs">
      <button className="notes-ai-prefs-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t("ai.prefs.title")}</button>
      {open ? (
        <div className="notes-ai-prefs-body">
          <p>{t("ai.prefs.how", { count: entries.length })}</p>
          {keys.length ? <ul>{keys.map((key) => <li key={key}>{t(PREFERENCE_KEYS[key])}</li>)}</ul> : <p className="notes-ai-prefs-empty">{t("ai.prefs.none")}</p>}
          {entries.length ? <button type="button" onClick={resetAiFeedback}>{t("ai.prefs.reset")}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
