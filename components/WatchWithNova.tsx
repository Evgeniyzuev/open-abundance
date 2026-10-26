"use client";

import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { postAiTool } from "@/lib/ai/toolClient";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { VideoEmbedProvider } from "@/lib/videoEmbed";
import {
  normalizeWatchReply,
  WATCH_AI_REPLIES_PER_VIDEO,
  WATCH_DAY_SOFT_LIMIT_MINUTES,
  WATCH_MAX_COMMENT,
  WATCH_REACTIONS,
  type WatchReaction
} from "@/lib/watchCompanion";

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;
type Line = { id: number; from: "nova" | "me"; text: string };

const PAUSED_KEY = "oa.watchNova.pausedDay";
const MINUTES_KEY = "oa.watchNova.minutes";
const TICK_MS = 30_000;
const DANCE_MS = 4_000;

const LOCAL_REACTION_KEYS: Record<WatchReaction, MessageKey> = {
  "😂": "video.nova.react.laugh",
  "🔥": "video.nova.react.fire",
  "😮": "video.nova.react.wow",
  "❤️": "video.nova.react.love",
  "💃": "video.nova.react.dance"
};

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* the companion still works for this visit */ }
}

/** Minutes watched together today; stored as "day:minutes" so it resets by itself tomorrow. */
function readMinutesToday(): number {
  const [day, minutes] = (readStored(MINUTES_KEY) ?? "").split(":");
  return day === today() ? Number(minutes) || 0 : 0;
}

/**
 * Nova sits next to one video: a hello, emoji reactions (answered locally, no AI),
 * a few AI replies to what the person writes, a little dance, and a gentle
 * "enough for today" after half an hour together.
 */
export default function WatchWithNova({ provider, title, author, locale, t, onClose, onEnough }: {
  provider: VideoEmbedProvider;
  title: string | null;
  author: string | null;
  locale: AppLocale;
  t: Translate;
  onClose: () => void;
  onEnough: () => void;
}) {
  const [paused, setPaused] = useState(() => readStored(PAUSED_KEY) === today());
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [dancing, setDancing] = useState(false);
  const [bubbles, setBubbles] = useState<Array<{ id: number; emoji: string }>>([]);
  const [overLimit, setOverLimit] = useState(() => readMinutesToday() >= WATCH_DAY_SOFT_LIMIT_MINUTES);
  const aiReplies = useRef(0);
  const reactions = useRef<WatchReaction[]>([]);
  const nextId = useRef(1);
  const greeted = useRef(false);
  const danceTimer = useRef<number | null>(null);

  function say(from: Line["from"], text: string) {
    const id = nextId.current++;
    setLines((current) => [...current.slice(-5), { id, from, text }]);
  }

  function pop(emoji: string) {
    const id = nextId.current++;
    setBubbles((current) => [...current.slice(-4), { id, emoji }]);
    window.setTimeout(() => setBubbles((current) => current.filter((bubble) => bubble.id !== id)), 1_600);
  }

  function dance() {
    setDancing(true);
    if (danceTimer.current) window.clearTimeout(danceTimer.current);
    danceTimer.current = window.setTimeout(() => setDancing(false), DANCE_MS);
  }

  /** On the hello a failure stays silent and the local greeting is shown instead. */
  async function askNova(comment: string, quietFailure = false): Promise<boolean> {
    if (aiReplies.current >= WATCH_AI_REPLIES_PER_VIDEO) {
      say("nova", t("video.nova.quiet"));
      return false;
    }
    setBusy(true);
    const result = await postAiTool("/api/ai/watch/react", { provider, title, author, comment, reactions: reactions.current, locale });
    setBusy(false);
    if (!result.ok) {
      if (quietFailure) return false;
      say("nova", result.reason === "quota" ? t("video.nova.quota") : result.reason === "signin" ? t("video.nova.signIn") : t("video.nova.offline"));
      return false;
    }
    const payload = result.payload as { mode?: string; message?: string };
    if (payload?.mode === "safety") {
      say("nova", payload.message ?? t("video.nova.offline"));
      return false;
    }
    const reply = normalizeWatchReply(result.payload);
    if (!reply) {
      if (!quietFailure) say("nova", t("video.nova.offline"));
      return false;
    }
    aiReplies.current += 1;
    say("nova", reply.text);
    if (reply.emoji) pop(reply.emoji);
    if (reply.dance) dance();
    return true;
  }

  useEffect(() => {
    if (paused || greeted.current) return;
    greeted.current = true;
    if (readMinutesToday() >= WATCH_DAY_SOFT_LIMIT_MINUTES) {
      say("nova", t("video.nova.enoughHint", { minutes: WATCH_DAY_SOFT_LIMIT_MINUTES }));
      return;
    }
    void askNova("", true).then((ok) => { if (!ok && aiReplies.current === 0) say("nova", t("video.nova.hello")); });
    // The hello runs once per opened companion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const minutes = readMinutesToday() + TICK_MS / 60_000;
      writeStored(MINUTES_KEY, `${today()}:${minutes}`);
      if (minutes >= WATCH_DAY_SOFT_LIMIT_MINUTES && !overLimit) {
        setOverLimit(true);
        say("nova", t("video.nova.enoughHint", { minutes: WATCH_DAY_SOFT_LIMIT_MINUTES }));
      }
    }, TICK_MS);
    return () => window.clearInterval(interval);
    // say and t are stable enough for a 30-second tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, overLimit]);

  useEffect(() => () => { if (danceTimer.current) window.clearTimeout(danceTimer.current); }, []);

  function react(emoji: WatchReaction) {
    reactions.current = [...reactions.current.slice(-4), emoji];
    pop(emoji);
    if (emoji === "💃") dance();
    say("nova", t(LOCAL_REACTION_KEYS[emoji]));
  }

  async function send() {
    const comment = draft.trim().slice(0, WATCH_MAX_COMMENT);
    if (!comment || busy) return;
    setDraft("");
    say("me", comment);
    await askNova(comment);
  }

  function enough() {
    writeStored(PAUSED_KEY, today());
    setPaused(true);
    onEnough();
  }

  if (paused) {
    return (
      <section className="watch-nova paused" aria-label={t("video.nova.title")}>
        <img className="watch-nova-avatar" src="/nova-fox-robot.webp" alt="" />
        <p>{t("video.nova.paused")}</p>
        <div className="watch-nova-footer">
          <button type="button" onClick={() => { writeStored(PAUSED_KEY, ""); greeted.current = false; setPaused(false); }}>{t("video.nova.resume")}</button>
          <button type="button" onClick={onClose}>{t("app.common.close")}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="watch-nova" aria-label={t("video.nova.title")}>
      <header>
        <span className={`watch-nova-avatar-wrap${dancing ? " dancing" : ""}`}>
          <img className="watch-nova-avatar" src="/nova-fox-robot.webp" alt="" />
          {bubbles.map((bubble) => <i className="watch-nova-bubble" key={bubble.id} aria-hidden="true">{bubble.emoji}</i>)}
        </span>
        <div>
          <strong>{t("video.nova.title")}</strong>
          <small>{t("video.nova.honest")}</small>
        </div>
        <button className="watch-nova-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="watch-nova-lines" aria-live="polite">
        {lines.map((line) => <p className={line.from} key={line.id}>{line.text}</p>)}
        {busy ? <p className="nova typing">…</p> : null}
      </div>
      <div className="watch-nova-reactions">
        {WATCH_REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => react(emoji)} aria-label={t(LOCAL_REACTION_KEYS[emoji])}>{emoji}</button>)}
      </div>
      <form className="watch-nova-form" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <input value={draft} maxLength={WATCH_MAX_COMMENT} placeholder={t("video.nova.placeholder")} aria-label={t("video.nova.placeholder")} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" disabled={!draft.trim() || busy} aria-label={t("video.nova.send")}><Send size={15} /></button>
      </form>
      <div className="watch-nova-footer">
        <button className={overLimit ? "highlight" : undefined} type="button" onClick={enough}>{t("video.nova.enough")}</button>
      </div>
    </section>
  );
}
