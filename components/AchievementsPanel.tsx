"use client";

import { Heart, MessageCircle, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { ACHIEVEMENT_SERIES, type AchievementCounts, type AchievementSeries, type AchievementState } from "@/lib/achievements";
import { trackClientEvent } from "@/lib/clientAnalytics";
import type { MessageKey } from "@/lib/i18n";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { celebrate } from "@/lib/ui/feedback";

type Payload = { counts: AchievementCounts; achievements: AchievementState[]; error?: string };

const ICONS: Record<AchievementSeries, LucideIcon> = {
  comments: MessageCircle,
  posts: PenLine,
  reactions_received: Sparkles,
  reactions_given: Heart
};

/**
 * Achievements on the Results screen (Wishes), next to the artifacts: one row of round badges per chain (comments, posts, reactions received and
 * given). A reached badge shows "Claim +$…"; the server recounts before paying, once.
 */
export default function AchievementsPanel() {
  const { applyServerData, locale, t, user } = useUserContext();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetchWithSupabaseAuth("/api/achievements", { cache: "no-store" }, { authRequired: true });
      const next = await response.json() as Payload;
      if (response.ok && !next.error) setPayload(next);
    } catch {
      // The screen simply shows no achievements until the next visit.
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  async function claim(item: AchievementState, target: HTMLElement) {
    setClaiming(item.challengeId);
    setFailed(false);
    try {
      const response = await fetchWithSupabaseAuth("/api/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: item.challengeId })
      }, { authRequired: true });
      const next = await response.json() as Payload & { claimed?: boolean; core?: unknown; wallet?: unknown };
      if (!response.ok || next.error) throw new Error(next.error);
      setPayload({ counts: next.counts, achievements: next.achievements });
      if (next.core || next.wallet) applyServerData({ core: next.core as never, wallet: next.wallet as never });
      if (next.claimed) {
        celebrate(target);
        void trackClientEvent("achievement_claimed", { series: item.series, threshold: item.threshold });
      }
    } catch {
      setFailed(true);
    } finally {
      setClaiming(null);
    }
  }

  if (!user || !payload) return null;
  const money = (value: number) => formatRoundedMoney(value, locale);
  const readyCount = payload.achievements.filter((item) => item.status === "ready").length;
  const claimedCount = payload.achievements.filter((item) => item.status === "claimed").length;

  return (
    // Collapsed like the artifacts next to it; a reward waiting to be claimed opens it.
    <details className="artifact-passport achievements-panel" open={readyCount > 0 || undefined}>
      <summary>
        <strong>{t("achievements.title")}</strong>
        <small>{readyCount > 0 ? t("achievements.ready", { count: readyCount }) : t("artifact.count", { count: claimedCount, total: payload.achievements.length })}</small>
      </summary>
      {failed ? <p className="achievements-error">{t("achievements.claimFailed")}</p> : null}
      {ACHIEVEMENT_SERIES.map((series) => {
        const items = payload.achievements.filter((item) => item.series === series);
        if (!items.length) return null;
        const Icon = ICONS[series];
        const unlocked = items.filter((item) => item.status !== "locked").length;
        // Claimed and ready badges first, then only the next one ahead, so the row shows where the person is.
        const nextLocked = items.find((item) => item.status === "locked");
        const shown = [...items.filter((item) => item.status === "ready"), ...items.filter((item) => item.status === "claimed").reverse(), ...(nextLocked ? [nextLocked] : [])];
        return (
          <div className="achievements-series" key={series}>
            <div className="achievements-series-head">
              <strong>{t(`achievements.series.${series}` as MessageKey)}</strong>
              <small>{t("achievements.unlocked", { done: unlocked, total: items.length })}</small>
            </div>
            <div className="achievements-row">
              {shown.map((item) => {
                const reward = item.reward.wallet > 0 ? `+${money(item.reward.core)} + ${money(item.reward.wallet)} Wallet` : `+${money(item.reward.core)}`;
                const count = payload.counts[series];
                return (
                  <div className={`achievement-badge ${item.status}`} key={item.challengeId}>
                    <span className={`achievement-medal series-${series}`} aria-hidden="true">
                      <Icon size={30} />
                      <b>{item.threshold}</b>
                    </span>
                    <strong>{t(`achievements.name.${series}` as MessageKey, { count: item.threshold })}</strong>
                    {item.status === "ready" ? (
                      <>
                        <button disabled={claiming === item.challengeId} type="button" onClick={(event) => { void claim(item, event.currentTarget); }}>
                          {claiming === item.challengeId ? t("app.common.loading") : t("achievements.claim")}
                        </button>
                        <small className="achievement-reward">{reward}</small>
                      </>
                    ) : item.status === "claimed" ? (
                      <small>{item.claimedAt ? new Date(item.claimedAt).toLocaleDateString(locale) : t("achievements.done")}</small>
                    ) : (
                      <>
                        <small>{t("achievements.progress", { count: Math.min(count, item.threshold), target: item.threshold })}</small>
                        <span className="achievement-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, (count / item.threshold) * 100)}%` }} /></span>
                        <small className="achievement-reward">{reward}</small>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </details>
  );
}
