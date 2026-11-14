"use client";

import { useCallback, useEffect, useState } from "react";
import { HeartHandshake } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { MESSAGE_MAX_CHARS, REQUEST_KINDS, REQUEST_MAX_CHARS, type RequestKind, type RequestView } from "@/lib/novaRequests";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type State = { available: boolean; mine: RequestView[]; helping: RequestView[]; invited: RequestView[] };

const KIND_KEY: Record<RequestKind, MessageKey> = {
  advice: "novaRequests.kind.advice",
  help: "novaRequests.kind.help",
  partner: "novaRequests.kind.partner",
  talk: "novaRequests.kind.talk"
};
const PROBLEM_KEY: Record<string, MessageKey> = {
  contacts: "novaRequests.problem.contacts",
  length: "novaRequests.problem.length",
  limit: "novaRequests.problem.limit"
};

/**
 * «Просьба через Нову» on Home. A person asks Nova for advice, help, a partner or a talk; Nova passes it on without
 * a name. A helper says «Могу», the author confirms, and then they write to each other through Nova. Names appear
 * only when both chose to show them, and either side can leave at any step.
 */
export default function NovaRequestsCard({ active }: { active: boolean }) {
  const { t, user } = useUserContext();
  const userId = user?.id ?? null;
  const [state, setState] = useState<State | null>(null);
  const [asking, setAsking] = useState(false);
  const [kind, setKind] = useState<RequestKind>("help");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<MessageKey | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth("/api/nova/requests", { cache: "no-store" }, { authRequired: true });
      if (!response.ok) return;
      const data = (await response.json()) as State;
      setState(data.available ? data : null);
    } catch {
      // The card stays as it was; the next visit loads again.
    }
  }, []);

  useEffect(() => {
    if (active && userId) void load();
  }, [active, userId, load]);

  const send = useCallback(async (path: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetchWithSupabaseAuth(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, { authRequired: true });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { problem?: string } | null;
        setProblem(PROBLEM_KEY[data?.problem ?? ""] ?? "novaRequests.problem.generic");
        return false;
      }
      await load();
      return true;
    } catch {
      setProblem("novaRequests.problem.generic");
      return false;
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (!active || !userId || !state) return null;

  async function create() {
    if (await send("/api/nova/requests", { kind, body: text })) {
      setText("");
      setAsking(false);
    }
  }
  const act = (id: string, body: Record<string, unknown>) => send(`/api/nova/requests/${id}`, body);
  async function sendMessage(id: string) {
    const body = (drafts[id] ?? "").trim();
    if (body && await act(id, { action: "message", body })) setDrafts((current) => ({ ...current, [id]: "" }));
  }

  function conversation(view: RequestView) {
    return (
      <div className="nova-request-talk">
        <p className="nova-request-note">
          {view.otherName ? t("novaRequests.talk.named", { name: view.otherName }) : view.iRevealed ? t("novaRequests.talk.waitingReveal") : view.theyRevealed ? t("novaRequests.talk.theyRevealed") : t("novaRequests.talk.hidden")}
        </p>
        {view.messages.map((message) => (
          <p className={`nova-request-message${message.mine ? " mine" : ""}`} key={message.id}>
            <small>{message.mine ? t("novaRequests.talk.you") : view.otherName ?? t("novaRequests.talk.other")}</small>
            {message.body}
          </p>
        ))}
        <textarea
          aria-label={t("novaRequests.talk.placeholder")}
          maxLength={MESSAGE_MAX_CHARS}
          placeholder={t("novaRequests.talk.placeholder")}
          rows={2}
          value={drafts[view.id] ?? ""}
          onChange={(event) => setDrafts((current) => ({ ...current, [view.id]: event.target.value }))}
        />
        <div className="nova-request-actions">
          <button className="task-done-primary-button" type="button" disabled={busy || !(drafts[view.id] ?? "").trim()} onClick={() => void sendMessage(view.id)}>{t("novaRequests.talk.send")}</button>
          {!view.iRevealed ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "reveal" })}>{t("novaRequests.talk.reveal")}</button> : null}
        </div>
        <div className="nova-request-actions">
          {view.role === "requester" ? (
            <>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "close", helped: true })}>{t("novaRequests.close.helped")}</button>
              <button className="text-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "close", helped: false })}>{t("novaRequests.close.notHelped")}</button>
            </>
          ) : (
            <button className="text-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "close" })}>{t("novaRequests.close.leave")}</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="home-card nova-requests-card" aria-labelledby="nova-requests-title">
      <span className="home-card-label"><HeartHandshake size={14} aria-hidden="true" />{t("novaRequests.label")}</span>
      <h2 id="nova-requests-title">{t("novaRequests.title")}</h2>
      <p>{t("novaRequests.rule")}</p>

      {asking ? (
        <div className="nova-request-form">
          <div className="nova-request-kinds" role="group" aria-label={t("novaRequests.kind.label")}>
            {REQUEST_KINDS.map((item) => (
              <button className={item === kind ? "task-done-primary-button" : "secondary-button"} key={item} type="button" aria-pressed={item === kind} onClick={() => setKind(item)}>{t(KIND_KEY[item])}</button>
            ))}
          </div>
          <textarea aria-label={t("novaRequests.placeholder")} maxLength={REQUEST_MAX_CHARS} placeholder={t("novaRequests.placeholder")} rows={3} value={text} onChange={(event) => setText(event.target.value)} />
          <div className="nova-request-actions">
            <button className="task-done-primary-button" type="button" disabled={busy || text.trim().length < 3} onClick={() => void create()}>{t("novaRequests.send")}</button>
            <button className="text-button" type="button" onClick={() => { setAsking(false); setProblem(null); }}>{t("novaRequests.cancelForm")}</button>
          </div>
        </div>
      ) : (
        <button className="task-done-primary-button" type="button" onClick={() => setAsking(true)}>{t("novaRequests.ask")}</button>
      )}
      {problem ? <p className="nova-request-problem" role="alert">{t(problem)}</p> : null}

      {state.mine.map((view) => (
        <article className="nova-request-item" key={view.id}>
          <small>{t("novaRequests.mine")} · {t(KIND_KEY[view.kind])}</small>
          <strong>{view.body}</strong>
          {view.status === "matched" ? conversation(view) : view.ready.length ? (
            <>
              <p className="nova-request-note">{t("novaRequests.ready", { count: view.ready.length })}</p>
              <div className="nova-request-actions">
                <button className="task-done-primary-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "connect", offerId: view.ready[0].offerId })}>{t("novaRequests.connect")}</button>
                <button className="text-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "cancel" })}>{t("novaRequests.withdraw")}</button>
              </div>
            </>
          ) : (
            <>
              <p className="nova-request-note">{t("novaRequests.waiting")}</p>
              <button className="text-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "cancel" })}>{t("novaRequests.withdraw")}</button>
            </>
          )}
        </article>
      ))}

      {state.helping.map((view) => (
        <article className="nova-request-item" key={view.id}>
          <small>{t("novaRequests.helping")} · {t(KIND_KEY[view.kind])}</small>
          <strong>{view.body}</strong>
          {conversation(view)}
        </article>
      ))}

      {state.invited.length ? <h3>{t("novaRequests.invitedTitle")}</h3> : null}
      {state.invited.map((view) => (
        <article className="nova-request-item" key={view.id}>
          <small>{t(KIND_KEY[view.kind])}</small>
          <strong>{view.body}</strong>
          {view.saidCan ? <p className="nova-request-note">{t("novaRequests.saidCan")}</p> : (
            <div className="nova-request-actions">
              <button className="task-done-primary-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "can" })}>{t("novaRequests.can")}</button>
              <button className="text-button" type="button" disabled={busy} onClick={() => void act(view.id, { action: "pass" })}>{t("novaRequests.pass")}</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
