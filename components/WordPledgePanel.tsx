"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { trackProductEvent } from "@/lib/productAnalytics";
import { pledgeBonus } from "@/lib/wordPledge";

type Pledge = { id: string; goal: string; amount: number; bonus_amount: number; deadline_at: string; status: "active" | "kept" | "missed" };
type PledgeState = { available: boolean; pledge: Pledge | null; walletBalance: number; amounts: number[]; quests: Array<{ id: string; title: string }> };

const money = (value: number) => `$${Number(value).toFixed(2).replace(/\.00$/, "")}`;

/**
 * "Price of your word": the person may promise to finish one accepted quest by the next meeting and put a small deposit
 * from the Wallet on it. Finished in time: the deposit comes back plus a Core bonus. Optional, offered after a meeting.
 * mode "status" only shows an active promise or its recent result; "offer" also lets the person make one.
 */
export default function WordPledgePanel({ mode, nextMeetingDay, standalone = false }: { mode: "status" | "offer"; nextMeetingDay: string | null; standalone?: boolean }) {
  const { locale, t, user } = useUserContext();
  const [state, setState] = useState<PledgeState | null>(null);
  const [questId, setQuestId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth(`/api/word-pledge?locale=${locale}`, { cache: "no-store" }, { authRequired: true });
      if (!response.ok) return;
      const payload = (await response.json()) as PledgeState;
      if (payload.available) setState(payload);
    } catch {
      // The panel stays hidden.
    }
  }, [locale]);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  if (!state) return null;
  const deadline = state.pledge ? new Date(state.pledge.deadline_at).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }) : "";

  let content: React.ReactNode = null;
  if (state.pledge?.status === "active") {
    content = <p>{t("wordPledge.active", { goal: state.pledge.goal, day: deadline, amount: money(state.pledge.amount), bonus: money(pledgeBonus(state.pledge.amount)) })}</p>;
  } else if (state.pledge?.status === "kept") {
    content = <p role="status">{t("wordPledge.kept", { amount: money(state.pledge.amount), bonus: money(state.pledge.bonus_amount) })}</p>;
  } else if (state.pledge?.status === "missed") {
    content = <p role="status">{t("wordPledge.missed", { amount: money(state.pledge.amount) })}</p>;
  } else if (mode === "offer" && state.quests.length && state.amounts.length) {
    const chosenQuest = questId || state.quests[0].id;
    const submit = async () => {
      if (!amount) return;
      setSaving(true);
      setFailure(null);
      const goal = state.quests.find((quest) => quest.id === chosenQuest)?.title ?? "";
      const response = await fetchWithSupabaseAuth(
        "/api/word-pledge",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userChallengeId: chosenQuest, amount, goal, nextMeetingDay }) },
        { authRequired: true }
      ).catch(() => null);
      setSaving(false);
      if (response?.ok) {
        trackProductEvent("word_pledge_made_ui", { amount });
        await load();
      } else {
        const payload = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
        setFailure(payload.error ?? t("wordPledge.error"));
      }
    };
    content = (
      <details className="word-pledge-offer">
        <summary>{t("wordPledge.offerTitle")}</summary>
        <p>{t("wordPledge.offerBody")}</p>
        <label className="finance-field">
          <span>{t("wordPledge.quest")}</span>
          <select value={chosenQuest} onChange={(event) => setQuestId(event.target.value)}>
            {state.quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}
          </select>
        </label>
        <div className="chips">
          {state.amounts.map((value) => (
            <button aria-pressed={amount === value} className="chip" key={value} type="button" onClick={() => setAmount(value)}>
              {money(value)} → +{money(pledgeBonus(value))} Core
            </button>
          ))}
        </div>
        {failure ? <p className="finance-error inline">{failure}</p> : null}
        <button className="secondary-button" type="button" disabled={saving || !amount} onClick={() => void submit()}>{t("wordPledge.submit")}</button>
        <small>{t("wordPledge.rules")}</small>
      </details>
    );
  }
  if (!content) return null;
  if (!standalone) return <div className="word-pledge">{content}</div>;
  return (
    <section className="lead-meeting home-card word-pledge" aria-live="polite">
      <span className="home-card-label">{t("wordPledge.label")}</span>
      {content}
    </section>
  );
}
