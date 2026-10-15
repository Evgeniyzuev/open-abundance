"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

export type ReferralSummary = {
  enabled: boolean;
  amounts: { levelTwoCore: number; humanity: number };
  referrals: { total: number; human: number };
  rewards: { wallet: number; core: number };
  unseen: Array<{ id: string; kind: "level_2" | "humanity_confirmed"; amount: number; destination: "wallet" | "core"; createdAt: string }>;
};

/** Describes how referral rewards work and shows the user's own counts and paid amounts. */
export default function ReferralProgramSummary() {
  const { t, locale, user } = useUserContext();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/referrals/summary?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        if (!response.ok) return;
        const payload = (await response.json()) as ReferralSummary;
        if (!cancelled) setSummary(payload);
      } catch {
        // The description is static text; only the numbers are hidden when loading fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || !summary?.enabled) return null;
  const money = (value: number) => formatAdaptiveMoney(value, locale);

  return (
    <section className="referral-program" aria-label={t("referral.program.title")} style={{ margin: "12px 0", padding: 14, borderRadius: 16, background: "rgba(0, 113, 227, 0.06)" }}>
      <strong>{t("referral.program.title")}</strong>
      <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
        <li>{t("referral.program.levelTwo", { amount: money(summary.amounts.levelTwoCore) })}</li>
        <li>{t("referral.program.humanity", { amount: money(summary.amounts.humanity) })}</li>
      </ul>
      <p className="transfer-muted">{t("referral.program.note")}</p>
      <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", margin: "8px 0 0" }}>
        <dt>{t("referral.program.statTotal")}</dt><dd>{summary.referrals.total}</dd>
        <dt>{t("referral.program.statHuman")}</dt><dd>{summary.referrals.human}</dd>
        <dt>{t("referral.program.statWallet")}</dt><dd>{money(summary.rewards.wallet)}</dd>
        <dt>{t("referral.program.statCore")}</dt><dd>{money(summary.rewards.core)}</dd>
      </dl>
    </section>
  );
}
