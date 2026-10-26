"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

export type ReferralSummary = {
  enabled: boolean;
  amounts: {
    levelTwoCore: number;
    humanity: number;
    signupCore: number;
    activeCore: number;
    activeWallet: number;
    confirmedMultiplier: number;
    humanityCore: number;
    humanityWallet: number;
    leaderPercent: number;
  };
  viewerConfirmed: boolean;
  referrals: { total: number; active: number; human: number };
  rewards: { wallet: number; core: number };
  unseen: Array<{ id: string; kind: string; amount: number; destination: "wallet" | "core"; createdAt: string }>;
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
    <details className="referral-program" style={{ margin: "12px 0", padding: 14, borderRadius: 16, background: "rgba(0, 113, 227, 0.06)" }}>
      <summary><strong>{t("referral.program.title")}</strong></summary>
      <ul style={{ margin: "8px 0", paddingInlineStart: 18 }}>
        {referralRewardLines(summary.amounts, money).map(([key, values]) => <li key={key}>{t(key, values)}</li>)}
      </ul>
      <p className="transfer-muted">{t("referral.program.note")}</p>
      <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", margin: "8px 0 0" }}>
        <dt>{t("referral.program.statTotal")}</dt><dd>{summary.referrals.total}</dd>
        <dt>{t("referral.program.statActive")}</dt><dd>{summary.referrals.active}</dd>
        <dt>{t("referral.program.statHuman")}</dt><dd>{summary.referrals.human}</dd>
        <dt>{t("referral.program.statWallet")}</dt><dd>{money(summary.rewards.wallet)}</dd>
        <dt>{t("referral.program.statCore")}</dt><dd>{money(summary.rewards.core)}</dd>
      </dl>
    </details>
  );
}

/** The program's rules as text lines, from the live settings so the texts never drift from what is paid. */
export function referralRewardLines(amounts: ReferralSummary["amounts"], money: (value: number) => string): Array<[MessageKey, Record<string, string>]> {
  const lines: Array<[MessageKey, Record<string, string>]> = [];
  if (amounts.signupCore > 0) lines.push(["referral.program.signup", { core: money(amounts.signupCore) }]);
  if (amounts.activeCore + amounts.activeWallet > 0) {
    const times = amounts.confirmedMultiplier;
    lines.push(["referral.program.active", {
      core: money(amounts.activeCore),
      wallet: money(amounts.activeWallet),
      coreConfirmed: money(amounts.activeCore * times),
      walletConfirmed: money(amounts.activeWallet * times)
    }]);
  }
  if (amounts.humanityCore + amounts.humanityWallet > 0) lines.push(["referral.program.humanityV2", { core: money(amounts.humanityCore), wallet: money(amounts.humanityWallet) }]);
  if (amounts.levelTwoCore > 0) lines.push(["referral.program.levelTwo", { amount: money(amounts.levelTwoCore) }]);
  lines.push(["referral.program.leader", { percent: String(amounts.leaderPercent) }]);
  return lines;
}
