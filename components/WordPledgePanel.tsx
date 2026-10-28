"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { trackProductEvent } from "@/lib/productAnalytics";
import { pledgeBonus } from "@/lib/wordPledge";

type Pledge = { id: string; goal: string; amount: number; bonus_percent: number; bonus_amount: number; deadline_at: string; status: "active" | "kept" | "missed" };
type PledgeState = { available: boolean; pledge: Pledge | null; walletBalance: number; amounts: number[]; quests: Array<{ id: string; title: string; percent: number; amounts: number[] }> };

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
  const [shared, setShared] = useState(false);
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
    content = <p>{t("wordPledge.active", { goal: state.pledge.goal, day: deadline, amount: money(state.pledge.amount), bonus: money(pledgeBonus(state.pledge.amount, Number(state.pledge.bonus_percent))) })}</p>;
  } else if (state.pledge?.status === "kept") {
    const pledgeId = state.pledge.id;
    const share = async () => {
      const response = await fetchWithSupabaseAuth(
        "/api/word-pledge",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", pledgeId }) },
        { authRequired: true }
      ).catch(() => null);
      if (response?.ok) setShared(true);
    };
    content = (
      <>
        <p role="status">{t("wordPledge.kept", { amount: money(state.pledge.amount), bonus: money(state.pledge.bonus_amount) })}</p>
        <button className="secondary-button" type="button" disabled={shared} onClick={() => void share()}>
          {shared ? t("wordPledge.shared") : t("wordPledge.share")}
        </button>
      </>
    );
  } else if (state.pledge?.status === "missed") {
    content = <p role="status">{t("wordPledge.missed", { amount: money(state.pledge.amount) })}</p>;
  } else if (mode === "offer" && state.quests.length) {
    const chosenQuest = questId || state.quests[0].id;
    const quest = state.quests.find((item) => item.id === chosenQuest);
    const percent = quest?.percent ?? 0;
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
        const known = ["amount", "amount_cap", "deadline", "quest", "quest_used", "active", "balance", "no_value"];
        setFailure(t((payload.error && known.includes(payload.error) ? `wordPledge.error.${payload.error}` : "wordPledge.error") as MessageKey));
      }
    };
    content = (
      <details className="word-pledge-offer">
        <summary>{t("wordPledge.offerTitle")}</summary>
        <div className="word-pledge-body">
        <p>{t("wordPledge.offerBody")}</p>
        <label className="finance-field">
          <span>{t("wordPledge.quest")}</span>
          <select value={chosenQuest} onChange={(event) => { setQuestId(event.target.value); setAmount(null); }}>
            {state.quests.map((quest) => <option key={quest.id} value={quest.id}>{t("wordPledge.questOption", { title: quest.title, percent: quest.percent })}</option>)}
          </select>
        </label>
        <div className="chips">
          {(quest?.amounts ?? []).map((value) => (
            <button aria-pressed={amount === value} className="chip" key={value} type="button" onClick={() => setAmount(value)}>
              {t("wordPledge.amountChip", { amount: money(value), bonus: money(pledgeBonus(value, percent)) })}
            </button>
          ))}
        </div>
        {failure ? <p className="finance-error inline">{failure}</p> : null}
        <button className="secondary-button" type="button" disabled={saving || !amount} onClick={() => void submit()}>{t("wordPledge.submit")}</button>
        <small className="word-pledge-rules">{t("wordPledge.rules")}</small>
        </div>
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
