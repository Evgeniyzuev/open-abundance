"use client";

import { useEffect, useRef, useState } from "react";
import {
  ALINA_MAX_MESSAGE,
  ALINA_RETURN_KEY,
  ALINA_SIGN_IN_NOTE,
  ALINA_STORAGE_KEY,
  openingMessages,
  personTurns,
  type AlinaMessage,
  type AlinaStage
} from "@/lib/alinaMentor";
import { OA_LEAD_PERSONA } from "@/lib/oaLeadPersona";
import { trackProductEvent } from "@/lib/productAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type Saved = { messages: AlinaMessage[]; stage: AlinaStage; wish: string | null; step: string | null; wishSaved: boolean };

const SIGN_IN_HREF = "/?utm_source=alina&utm_medium=mentor_chat";

/** "Разберу лично твою ситуацию": the conversation with Alina, kept on the device (lib/alinaMentor.ts). */
export default function AlinaChat({ locale }: { locale: "ru" | "en" }) {
  const ru = locale === "ru";
  const [state, setState] = useState<Saved>(() => ({ messages: openingMessages(locale), stage: "now", wish: null, step: null, wishSaved: false }));
  const [draft, setDraft] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<{ title: string; message: string; actions: string[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const resumed = useRef(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(ALINA_STORAGE_KEY) ?? "null") as Saved | null;
      if (stored?.messages?.length) setState(stored);
    } catch {
      // A broken or blocked storage just starts a fresh conversation.
    }
    try {
      void getBrowserSupabaseClient().auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)), () => setSignedIn(false));
    } catch {
      setSignedIn(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ALINA_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Not saved on this device; the conversation still works.
    }
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state]);

  // Back from signing in with the guest's answer still waiting: Alina answers it now.
  useEffect(() => {
    if (!signedIn || resumed.current) return;
    resumed.current = true;
    const last = state.messages[state.messages.length - 1];
    if (last?.role === "person") void ask(state.messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  async function ask(messages: AlinaMessage[]) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/ai/alina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, locale })
      });
      const payload = await response.json().catch(() => null) as { text?: string; stage?: AlinaStage; wish?: string | null; step?: string | null; mode?: string; title?: string; message?: string; actions?: string[]; code?: string } | null;
      if (payload?.mode === "safety") {
        setSafety({ title: payload.title ?? "", message: payload.message ?? "", actions: payload.actions ?? [] });
        return;
      }
      if (!response.ok || !payload?.text) {
        setError(payload?.code === "ai_quota_exhausted"
          ? (ru ? "На сегодня мы с тобой наговорились. Давай продолжим завтра." : "We've talked a lot today. Let's continue tomorrow.")
          : (ru ? "Не получилось ответить. Попробуй ещё раз чуть позже." : "I couldn't answer. Please try again a bit later."));
        return;
      }
      setState((current) => {
        const stage = payload.stage ?? current.stage;
        if (stage !== current.stage) trackProductEvent("alina_chat_stage", { stage });
        return {
          ...current,
          messages: [...messages, { role: "alina", text: payload.text! }],
          stage,
          wish: payload.wish ?? current.wish,
          step: payload.step ?? current.step
        };
      });
    } catch {
      setError(ru ? "Нет связи. Попробуй ещё раз." : "No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function send() {
    const text = draft.trim().slice(0, ALINA_MAX_MESSAGE);
    if (!text || busy) return;
    const messages: AlinaMessage[] = [...state.messages, { role: "person", text }];
    setDraft("");
    setState((current) => ({ ...current, messages }));
    if (personTurns(messages) === 1) trackProductEvent("alina_chat_started", { signedIn: Boolean(signedIn) });
    if (signedIn) void ask(messages);
  }

  async function saveWish() {
    if (!state.wish || busy) return;
    setBusy(true);
    try {
      const response = await fetchWithSupabaseAuth("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: state.wish, locale })
      }, { authRequired: true });
      if (response.ok) {
        setState((current) => ({ ...current, wishSaved: true }));
        trackProductEvent("alina_wish_saved", {});
      } else {
        setError(ru ? "Желание не сохранилось. Попробуй ещё раз." : "The wish was not saved. Please try again.");
      }
    } catch {
      setError(ru ? "Желание не сохранилось. Попробуй ещё раз." : "The wish was not saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setState({ messages: openingMessages(locale), stage: "now", wish: null, step: null, wishSaved: false });
    setSafety(null);
    setError(null);
  }

  const last = state.messages[state.messages.length - 1];
  const waitingForSignIn = signedIn === false && last?.role === "person";

  return (
    <section className="alina-chat" id="chat" aria-label={ru ? "Разговор с Алиной" : "Talk with Alina"}>
      <div className="alina-chat-log">
        {state.messages.map((message, index) => (
          <div key={index} className={`alina-bubble ${message.role}`}>
            {message.role === "alina" && (index === 0 || state.messages[index - 1].role !== "alina") ? <img alt="" src={OA_LEAD_PERSONA.avatarUrl} /> : null}
            <p>{message.text}</p>
          </div>
        ))}
        {busy && signedIn ? <div className="alina-bubble alina typing"><p>{ru ? "Алина печатает…" : "Alina is typing…"}</p></div> : null}
        {waitingForSignIn ? (
          <div className="alina-bubble alina">
            <p>{ALINA_SIGN_IN_NOTE[locale]}</p>
            <a
              className="legal-primary-action"
              href={SIGN_IN_HREF}
              onClick={() => {
                try { window.localStorage.setItem(ALINA_RETURN_KEY, "1"); } catch { /* still signs in */ }
                trackProductEvent("alina_sign_in_clicked", {});
              }}
            >
              {ru ? "Войти и продолжить" : "Sign in and continue"}
            </a>
          </div>
        ) : null}
        {safety ? (
          <div className="alina-safety" role="alert">
            <strong>{safety.title}</strong>
            <p>{safety.message}</p>
            <ul>{safety.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {state.wish && signedIn ? (
        <div className="alina-chat-card">
          <span>{ru ? "Твоё желание" : "Your wish"}</span>
          <strong>{state.wish}</strong>
          {state.wishSaved
            ? <a href="/?view=wishes">{ru ? "Сохранено. Открыть желания" : "Saved. Open wishes"}</a>
            : <button type="button" disabled={busy} onClick={() => void saveWish()}>{ru ? "Записать в мои желания" : "Add to my wishes"}</button>}
        </div>
      ) : null}
      {state.step && signedIn ? (
        <div className="alina-chat-card">
          <span>{ru ? "Первый шаг на сегодня" : "First step for today"}</span>
          <strong>{state.step}</strong>
        </div>
      ) : null}

      {error ? <p className="alina-chat-error">{error}</p> : null}

      {!waitingForSignIn && !safety ? (
        <form
          className="alina-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <textarea
            maxLength={ALINA_MAX_MESSAGE}
            rows={2}
            value={draft}
            placeholder={ru ? "Напиши как есть…" : "Write it as it is…"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <button type="submit" disabled={busy || !draft.trim()}>{ru ? "Отправить" : "Send"}</button>
        </form>
      ) : null}
      {personTurns(state.messages) > 0 ? (
        <button className="alina-chat-restart" type="button" onClick={restart}>{ru ? "Начать разговор заново" : "Start over"}</button>
      ) : null}
    </section>
  );
}
