"use client";

import { useState } from "react";
import { Bot, Hourglass, Sparkles, X } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { OPEN_AI_PROMPT_EVENT, requestNoteAiReview, type NoteAiRequestFailure } from "@/lib/noteAiClient";
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
export function NoteAiAnswer({ note, moveTarget, onMove, onCreateTasks, onAddWish, onAgain }: {
  note: Note;
  /** A list the answer suggested that exists on this device, if any. */
  moveTarget?: { id: string; title: string };
  onMove: (listId: string) => void;
  onCreateTasks: (items: string[]) => Promise<void>;
  onAddWish: () => Promise<void>;
  onAgain: () => void;
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
    </section>
  );
}
