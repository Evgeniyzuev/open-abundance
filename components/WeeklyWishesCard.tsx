"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { trackProductEvent } from "@/lib/productAnalytics";
import type { WeeklyWishState } from "@/lib/weeklyWishes";

type Loaded = WeeklyWishState & { available: boolean };

/**
 * "Wishes of the week" on Home: every week Open Abundance helps fulfil several wishes of active participants.
 * The card says whether the person's wish takes part this week and gives the one action that is left.
 */
export default function WeeklyWishesCard({ active, onOpenWishes, onOpenQuests }: { active: boolean; onOpenWishes: () => void; onOpenQuests: () => void }) {
  const { t, user } = useUserContext();
  const [state, setState] = useState<Loaded | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    fetchWithSupabaseAuth("/api/wishes/week", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Loaded | null) => {
        if (cancelled || !data?.available) return;
        setState(data);
        trackProductEvent("weekly_wishes_shown", { participating: data.participating, next: data.next });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, userId]);

  if (!active || !state) return null;

  function act() {
    if (!state) return;
    trackProductEvent("weekly_wishes_action", { next: state.next });
    if (state.next === "add_wish") onOpenWishes();
    else onOpenQuests();
  }

  return (
    <section className="home-card weekly-wishes-card" aria-labelledby="weekly-wishes-title">
      <span className="home-card-label"><Sparkles size={14} aria-hidden="true" />{t("weeklyWishes.label", { days: state.daysLeft })}</span>
      <h2 id="weekly-wishes-title">{t("weeklyWishes.title")}</h2>
      <p>{t("weeklyWishes.rule")}</p>
      <p className={`weekly-wishes-status${state.participating ? " in" : ""}`}>
        {t(state.next === "add_wish" ? "weeklyWishes.status.addWish" : state.next === "make_step" ? "weeklyWishes.status.makeStep" : "weeklyWishes.status.in", { steps: state.stepsThisWeek })}
      </p>
      <button className={state.participating ? "secondary-button" : "primary-button"} type="button" onClick={act}>
        {t(state.next === "add_wish" ? "weeklyWishes.action.addWish" : state.next === "make_step" ? "weeklyWishes.action.makeStep" : "weeklyWishes.action.more")}
      </button>
    </section>
  );
}
