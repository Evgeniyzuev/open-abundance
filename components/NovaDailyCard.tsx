"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { decideNovaCard, pickNovaCard, type NovaCardKind, type NovaCardState } from "@/lib/novaCards";
import { previousWeekStart } from "@/lib/novaWeekly";
import { readPrimaryWish } from "@/lib/wishJourney";

/**
 * Nova's daily card on the Today screen: one short, rule-based message a day (no model call, no
 * push). It appears for a newcomer, someone coming back, a concrete Core step or a gentle question
 * about their main wish. Closing it three days in a row pauses cards for a week.
 */
export default function NovaDailyCard({ active, onOpenChat, onOpenCore }: { active: boolean; onOpenChat: () => void; onOpenCore: () => void }) {
  const { t, locale, user, profile, core, wallet } = useUserContext();
  const [kind, setKind] = useState<NovaCardKind | null>(null);
  const [weekly, setWeekly] = useState<{ weekStart: string; body: string } | null>(null);
  const userId = user?.id ?? null;
  const createdAt = profile?.created_at ?? null;
  const coreLevel = core?.level ?? null;
  const coreBalance = core?.balance ?? null;
  const threshold = core?.next_level_threshold ?? null;
  const walletBalance = wallet?.balance ?? null;

  // The weekly summary is requested at most once per week on this device; the server writes it once per week.
  useEffect(() => {
    if (!active || !userId) return;
    const weekStart = previousWeekStart(Date.now());
    const fetchedKey = `oa-nova-week-fetched.v1.${userId}`;
    try {
      if (window.localStorage.getItem(fetchedKey) === weekStart) {
        const stored = window.localStorage.getItem(`oa-nova-week-body.v1.${userId}`);
        if (stored) setWeekly({ weekStart, body: stored });
        return;
      }
    } catch { return; }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/nova/weekly?locale=${locale}`, { cache: "no-store" }, { authRequired: true });
        if (!response.ok) return;
        const payload = (await response.json()) as { summary: { weekStart: string; body: string } | null };
        try {
          window.localStorage.setItem(fetchedKey, weekStart);
          if (payload.summary) window.localStorage.setItem(`oa-nova-week-body.v1.${userId}`, payload.summary.body);
        } catch { /* it will be requested again next time */ }
        if (!cancelled && payload.summary) setWeekly(payload.summary);
      } catch { /* a missing summary is not an error */ }
    })();
    return () => { cancelled = true; };
  }, [active, userId, locale]);

  useEffect(() => {
    if (!active || !userId || coreLevel === null) { setKind(null); return; }
    try {
      const today = localDay(new Date());
      const visitKey = `oa-nova-visit.v1.${userId}`;
      const lastVisit = window.localStorage.getItem(visitKey);
      const daysSinceVisit = lastVisit ? Math.floor((Date.parse(today) - Date.parse(lastVisit)) / 86_400_000) : null;
      const ageDays = createdAt ? (Date.now() - Date.parse(createdAt)) / 86_400_000 : null;
      const candidate = pickNovaCard({
        ageDays: ageDays !== null && Number.isFinite(ageDays) ? ageDays : null,
        daysSinceVisit: daysSinceVisit !== null && Number.isFinite(daysSinceVisit) ? daysSinceVisit : null,
        hasWish: Boolean(readPrimaryWish(userId)),
        canTopUpToNextLevel: (walletBalance ?? 0) > 0 && threshold !== null && coreBalance !== null && threshold > coreBalance,
        hasWeeklySummary: Boolean(weekly) && window.localStorage.getItem(`oa-nova-week-shown.v1.${userId}`) !== weekly?.weekStart
      });
      const decision = decideNovaCard(readState(userId), today, candidate);
      if (decision.state) writeState(userId, decision.state);
      if (decision.show === "week" && weekly) window.localStorage.setItem(`oa-nova-week-shown.v1.${userId}`, weekly.weekStart);
      // Remember today's visit after the decision, so "coming back" is judged against the previous visit.
      if (lastVisit !== today) window.localStorage.setItem(visitKey, today);
      setKind(decision.show);
    } catch {
      setKind(null);
    }
  }, [active, userId, createdAt, coreLevel, coreBalance, threshold, walletBalance, weekly]);

  if (!kind || !userId || coreLevel === null) return null;

  const wishTitle = readPrimaryWish(userId)?.title ?? "";
  const remaining = threshold !== null && coreBalance !== null ? Math.max(0, threshold - coreBalance) : 0;
  const values = { level: coreLevel + 1, amount: formatAdaptiveMoney(remaining, locale), wish: wishTitle };

  function update(change: Partial<NovaCardState>) {
    const current = readState(userId as string);
    if (current) writeState(userId as string, { ...current, ...change });
  }

  return (
    <section className="home-card self-serve-checkin nova-daily-card" aria-labelledby="nova-daily-title">
      <div className="nova-daily-head">
        <Image src="/nova-fox-robot.webp" alt="" width={28} height={28} />
        <strong>{t("nova.card.from")}</strong>
        <button
          className="nova-daily-close"
          type="button"
          aria-label={t("app.common.close")}
          onClick={() => { update({ dismissed: true }); setKind(null); }}
        ><X size={16} /></button>
      </div>
      <h2 id="nova-daily-title">{t(`nova.card.${kind}.title` as never, values)}</h2>
      <p>{kind === "week" && weekly ? weekly.body : t(`nova.card.${kind}.body` as never, values)}</p>
      <div className="self-serve-checkin-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => { update({ acted: true }); setKind(null); if (kind === "level") onOpenCore(); else onOpenChat(); }}
        >{t(`nova.card.${kind}.action` as never)}</button>
      </div>
    </section>
  );
}

function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function stateKey(userId: string): string {
  return `oa-nova-card.v1.${userId}`;
}

function readState(userId: string): NovaCardState | null {
  try {
    const raw = window.localStorage.getItem(stateKey(userId));
    return raw ? (JSON.parse(raw) as NovaCardState) : null;
  } catch {
    return null;
  }
}

function writeState(userId: string, state: NovaCardState): void {
  try { window.localStorage.setItem(stateKey(userId), JSON.stringify(state)); } catch { /* without storage the card may show again */ }
}
