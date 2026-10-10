"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

const ASK_AFTER_HOURS = 48;
const REASK_AFTER_DAYS = 4;
const DAY_MS = 86_400_000;
const ANSWERS = [
  ["helped", "outcome.helped"],
  ["not_yet", "outcome.notYet"],
  ["not_relevant", "outcome.notRelevant"]
] as const;

type AskedWish = { id: string; title: string };

/**
 * One-tap outcome signal for the main wish: did the product bring the person closer to it?
 * This is the satisfaction input the coordinator optimises, so it is asked rarely: not before the
 * wish is two days old, at most once every few days, and not on top of the day-2 check-in.
 * The answer is stored as a product event with the wish id; the wish text is never sent.
 */
export default function WishOutcomeCheck({ active }: { active: boolean }) {
  const { t, user } = useUserContext();
  const [wish, setWish] = useState<AskedWish | null>(null);

  useEffect(() => {
    setWish(null);
    if (!active || !user) return;
    if (!checkInSettled(user.id, user.created_at)) return;
    const lastAsked = readLastAsked(user.id);
    if (lastAsked !== null && Date.now() - lastAsked < REASK_AFTER_DAYS * DAY_MS) return;

    let cancelled = false;
    fetchWithSupabaseAuth("/api/wishes?includeRecommended=false&status=active", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { wishes?: Array<{ id: string; title: string; created_at: string }> } | null) => {
        if (cancelled || !data?.wishes?.length) return;
        // Oldest active wish old enough to have had a chance to move.
        const eligible = data.wishes
          .filter((item) => Date.now() - Date.parse(item.created_at) >= ASK_AFTER_HOURS * 3_600_000)
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
        if (eligible) setWish({ id: eligible.id, title: eligible.title });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, user]);

  if (!active || !user || !wish) return null;

  function answer(value: string) {
    if (!user || !wish) return;
    void trackClientEvent("wish_outcome_answered", { answer: value, wish_id: wish.id });
    writeLastAsked(user.id);
    setWish(null);
  }

  return (
    <section className="home-card self-serve-checkin" aria-labelledby="wish-outcome-title">
      <h2 id="wish-outcome-title">{t("outcome.title", { title: wish.title })}</h2>
      <div className="self-serve-checkin-actions">
        {ANSWERS.map(([value, key]) => (
          <button className="secondary-button" key={value} type="button" onClick={() => answer(value)}>
            {t(key)}
          </button>
        ))}
      </div>
      <button className="text-button self-serve-checkin-skip" type="button" onClick={() => { if (user) writeLastAsked(user.id); setWish(null); }}>
        {t("experiment.checkin.skip")}
      </button>
    </section>
  );
}

/** Stay out of the way of the day-2 check-in: show only after it was handled or its window ended. */
function checkInSettled(userId: string, createdAt: string): boolean {
  const ageHours = (Date.now() - Date.parse(createdAt)) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < ASK_AFTER_HOURS) return false;
  if (ageHours > 24 * 7) return true;
  try {
    return window.localStorage.getItem(`openAbundanceSelfServeCheckIn.v1.${userId}`) !== null;
  } catch {
    return false;
  }
}

function readLastAsked(userId: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(`openAbundanceWishOutcome.v1.${userId}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastAsked(userId: string): void {
  try {
    window.localStorage.setItem(`openAbundanceWishOutcome.v1.${userId}`, String(Date.now()));
  } catch {
    // Without storage the question can reappear; that is acceptable.
  }
}
