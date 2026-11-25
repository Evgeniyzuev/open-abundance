"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Flame, Lock, ThumbsDown, ThumbsUp, X } from "lucide-react";
import MomentShare from "@/components/MomentShare";
import { useUserContext } from "@/components/UserProvider";
import { LIFE_STORAGE } from "@/lib/lifeChoices";
import { trackProductEvent } from "@/lib/productAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { PENDING_CALL_KEY, PROOF_TEXT_MAX, callsUi, type CallView, type EntryStatus } from "@/lib/wordCalls";

type CallItem = CallView & { multiplier: number; open: boolean };
type MineItem = { id: string; status: EntryStatus; call: CallView | null; proofText: string; proofUrl: string | null; aiNote: string; votesYes: number; votesNo: number; multiplier: number; reward: number; deadlineAt: string };
type PublicItem = { id: string; name: string; callTitle: string; kind: string; proofText: string; proofUrl: string | null; aiNote: string; votes: number; multiplier: number; reward: number; at: string };
type State = { available: boolean; cap: number; canVote: boolean; record: { kept: number; given: number }; missions: CallView[]; calls: CallItem[]; mine: MineItem[]; queue: PublicItem[]; gallery: PublicItem[] };

const money = (value: number) => `$${Number(value).toFixed(2).replace(/\.00$/, "")}`;

function readMainSphere(): string | null {
  try {
    const raw = window.localStorage.getItem(LIFE_STORAGE.result);
    const parsed = raw ? (JSON.parse(raw) as { main?: { sphere?: string } }) : null;
    return parsed?.main?.sphere ?? null;
  } catch {
    return null;
  }
}

function readPendingCall(): string | null {
  try { return window.localStorage.getItem(PENDING_CALL_KEY); } catch { return null; }
}

function clearPendingCall() {
  try { window.localStorage.removeItem(PENDING_CALL_KEY); } catch { /* nothing to clear */ }
  window.dispatchEvent(new Event("oa:pending-call-cleared"));
}

/**
 * «Вызовы»: calls with the price of one's word and sealed missions from Nova. Take, do, show how; Nova and members
 * check it; the reward grows when few people manage (multiplier up to ×5 within the reserve light).
 */
export default function WordCallsApp({ active }: { active: boolean }) {
  const { locale, user } = useUserContext();
  const ui = (key: Parameters<typeof callsUi>[0], values?: Record<string, string | number>) => callsUi(key, locale, values);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sphere = readMainSphere();
    const query = new URLSearchParams({ locale });
    if (sphere) query.set("sphere", sphere);
    try {
      const response = await fetchWithSupabaseAuth(`/api/word-calls?${query.toString()}`, { cache: "no-store" }, { authRequired: true });
      const payload = (await response.json().catch(() => null)) as State | null;
      if (payload) setState(payload);
    } catch {
      // stays as it was
    }
  }, [locale]);

  useEffect(() => {
    if (!active || !user) return;
    setPending(readPendingCall());
    void load();
  }, [active, user, load]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/word-calls", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, locale })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; safety?: { message?: string } };
      if (payload.safety) setError(payload.safety.message ?? ui("failed"));
      else if (!response.ok) setError(payload.error === "limit" ? ui("limit") : ui("failed"));
      await load();
      return response.ok && !payload.safety;
    } catch {
      setError(ui("failed"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function take(call: CallView) {
    const ok = await post({ action: "take", callId: call.id }, `take:${call.id}`);
    if (ok) {
      trackProductEvent("word_call_taken", { key: call.key, kind: call.kind, challenged: pending === call.key });
      if (pending === call.key) { clearPendingCall(); setPending(null); }
    }
  }

  if (!user || !state) return null;
  if (!state.available) return <section className="calls-screen"><header className="challenges-header"><h1>{ui("tab")}</h1></header><p className="calls-intro">{ui("soon")}</p></section>;

  const open = state.mine.filter((entry) => entry.status === "taken" || entry.status === "submitted");
  const settled = state.mine.filter((entry) => entry.status !== "taken" && entry.status !== "submitted").slice(0, 5);
  const challenged = pending ? state.calls.find((call) => call.key === pending && !call.open) : null;

  return (
    <section className="calls-screen">
      <header className="challenges-header">
        <h1>{ui("tab")}</h1>
        {state.record.given ? <small className="calls-record">{ui("record", state.record)}</small> : null}
      </header>
      <p className="calls-intro">{ui("intro")}</p>
      {error ? <p className="home-error" role="alert">{error}</p> : null}

      {challenged ? (
        <section className="home-card calls-challenged">
          <span className="home-card-label"><Flame size={14} aria-hidden="true" />{ui("challenged")}</span>
          <CallCard call={challenged} ui={ui} busy={busy === `take:${challenged.id}`} onTake={() => void take(challenged)} />
          <button className="text-button" type="button" onClick={() => { clearPendingCall(); setPending(null); }}>{ui("notNow")}</button>
        </section>
      ) : null}

      {open.length ? (
        <section className="calls-section">
          <h2>{ui("mineTitle")}</h2>
          {open.map((entry) => <OpenEntry key={entry.id} entry={entry} ui={ui} busy={busy} post={post} />)}
        </section>
      ) : null}

      {state.missions.length ? (
        <section className="calls-section">
          <h2>{ui("missionsTitle")}</h2>
          <p className="calls-hint">{ui("missionsHint")}</p>
          <div className="calls-missions">
            {state.missions.map((mission) => (
              <article className="home-card calls-mission" key={mission.id}>
                <span className="calls-seal"><Lock size={18} aria-hidden="true" />{ui("sealed")}</span>
                <CallFacts call={mission} ui={ui} />
                <button className="challenge-primary-action" type="button" disabled={busy === `take:${mission.id}`} onClick={() => void take(mission)}>{ui("takeMission")}</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {state.canVote && state.queue.length ? (
        <section className="calls-section">
          <h2>{ui("voteTitle")}</h2>
          <p className="calls-hint">{ui("voteHint")}</p>
          {state.queue.map((item) => (
            <article className="home-card calls-vote" key={item.id}>
              <strong>{item.name} · {item.callTitle}</strong>
              <p>{item.proofText}</p>
              {item.proofUrl ? <a href={item.proofUrl} target="_blank" rel="noopener noreferrer nofollow">{item.proofUrl}</a> : null}
              {item.aiNote ? <small>{ui("aiNote", { note: item.aiNote })}</small> : null}
              <div className="calls-actions">
                <button className="challenge-secondary-action" type="button" disabled={busy === `vote:${item.id}`} onClick={() => void post({ action: "vote", entryId: item.id, vote: true }, `vote:${item.id}`)}><ThumbsUp size={16} aria-hidden="true" />{ui("yes")}</button>
                <button className="challenge-secondary-action" type="button" disabled={busy === `vote:${item.id}`} onClick={() => void post({ action: "vote", entryId: item.id, vote: false }, `vote:${item.id}`)}><ThumbsDown size={16} aria-hidden="true" />{ui("no")}</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="calls-section">
        <h2>{ui("callsTitle")}</h2>
        {state.calls.map((call) => (
          <article className="home-card calls-call" key={call.id}>
            <CallCard call={call} ui={ui} busy={busy === `take:${call.id}`} onTake={() => void take(call)} />
          </article>
        ))}
      </section>

      {settled.length ? (
        <section className="calls-section">
          {settled.map((entry) => (
            <article className={`home-card calls-settled ${entry.status}`} key={entry.id}>
              <span className="calls-status">{entry.status === "kept" ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{ui(entry.status === "kept" ? "kept" : entry.status === "rejected" ? "rejected" : "broken")}</span>
              <strong>{entry.call?.title}</strong>
              {entry.status === "kept" ? (
                <>
                  <small>{ui("reward", { amount: money(entry.reward) })}{entry.multiplier > 1 ? ` · ×${entry.multiplier}` : ""}</small>
                  <MomentShare
                    kind={entry.call?.kind === "mission" ? "mission" : "pledge"}
                    title={entry.call?.title ?? ui("kept")}
                    line={`${ui("kept")}${entry.multiplier > 1 ? ` · ×${entry.multiplier}` : ""}`}
                    params={entry.call && entry.call.kind === "call" ? { call: entry.call.key } : undefined}
                  />
                  {entry.call?.kind === "call" ? <small className="calls-hint">{ui("passOn")}</small> : null}
                </>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      <section className="calls-section">
        <h2>{ui("galleryTitle")}</h2>
        {state.gallery.length ? state.gallery.map((item) => (
          <article className="home-card calls-gallery-item" key={item.id}>
            <strong>{item.name} · {item.callTitle}</strong>
            <p>{item.proofText}</p>
            {item.proofUrl ? <a href={item.proofUrl} target="_blank" rel="noopener noreferrer nofollow">{item.proofUrl}</a> : null}
            <small>{ui("reward", { amount: money(item.reward) })}{item.multiplier > 1 ? ` · ×${item.multiplier}` : ""}</small>
          </article>
        )) : <p className="calls-hint">{ui("galleryEmpty")}</p>}
      </section>
    </section>
  );
}

type Ui = (key: Parameters<typeof callsUi>[0], values?: Record<string, string | number>) => string;

function CallFacts({ call, ui }: { call: CallView & { multiplier?: number }; ui: Ui }) {
  return (
    <span className="calls-facts">
      <span>{call.minutes >= 60 ? ui("effortHours", { n: Math.round(call.minutes / 60) }) : ui("minutes", { n: call.minutes })}</span>
      <span aria-label={`${ui("difficulty")} ${call.difficulty}/3`}>{"●".repeat(call.difficulty)}{"○".repeat(3 - call.difficulty)}</span>
      <span>{ui("hours", { n: call.hours })}</span>
      <span>{ui("reward", { amount: money(call.baseReward) })}{call.multiplier && call.multiplier > 1 ? ` ×${call.multiplier}` : ""}</span>
    </span>
  );
}

function CallCard({ call, ui, busy, onTake }: { call: CallItem; ui: Ui; busy: boolean; onTake: () => void }) {
  return (
    <>
      <strong className="calls-title">{call.title}</strong>
      <p>{call.rule}</p>
      <CallFacts call={call} ui={ui} />
      {call.open ? <span className="calls-status"><Check size={16} aria-hidden="true" />{ui("taken")}</span> : (
        <button className="challenge-primary-action" type="button" disabled={busy} onClick={onTake}>{ui("take")}</button>
      )}
    </>
  );
}

function OpenEntry({ entry, ui, busy, post }: { entry: MineItem; ui: Ui; busy: string | null; post: (body: Record<string, unknown>, key: string) => Promise<boolean> }) {
  const { locale } = useUserContext();
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const call = entry.call;
  const deadline = new Date(entry.deadlineAt).toLocaleString(locale === "ru" ? "ru-RU" : "en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <article className="home-card calls-open">
      <strong className="calls-title">{call?.title}</strong>
      {call?.rule ? <p>{call.rule}</p> : null}
      {entry.status === "submitted" ? (
        <>
          <small>{ui("submitted", { yes: entry.votesYes, no: entry.votesNo })}</small>
          {entry.aiNote ? <small>{ui("aiNote", { note: entry.aiNote })}</small> : null}
        </>
      ) : (
        <>
          <small>{ui("deadline", { date: deadline })}</small>
          <label className="calls-field">
            <span>{call?.proofHint || ui("proofText")}</span>
            <textarea rows={3} maxLength={PROOF_TEXT_MAX} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <label className="calls-field">
            <span>{ui("proofUrl")}</span>
            <input type="url" inputMode="url" maxLength={500} placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <small className="calls-hint">{ui("visible")}</small>
          <div className="calls-actions">
            <button className="challenge-primary-action" type="button" disabled={busy === `submit:${entry.id}` || text.trim().length < 10} onClick={() => void post({ action: "submit", entryId: entry.id, proofText: text, proofUrl: url }, `submit:${entry.id}`)}>{ui("submit")}</button>
            <button className="text-button" type="button" disabled={busy === `giveup:${entry.id}`} onClick={() => void post({ action: "giveup", entryId: entry.id }, `giveup:${entry.id}`)}>{ui("giveUp")}</button>
          </div>
        </>
      )}
    </article>
  );
}
