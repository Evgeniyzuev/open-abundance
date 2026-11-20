"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type State = { eligible: boolean; limit: number; repaying: number; repayingDays: number | null; incoming: number };

/**
 * One line under the Wallet balance about «Взять и купить»: how much can be taken now, what is being repaid by Core
 * income, and what sellers still receive from buyers. Shows nothing until there is something to say.
 */
export default function InstallmentLine({ refreshKey }: { refreshKey?: unknown }) {
  const { t, locale, user } = useUserContext();
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchWithSupabaseAuth("/api/wallet/installments", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (alive) setState(data?.available ? data : null); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [user, refreshKey]);
  if (!state) return null;
  const money = (value: number) => formatAdaptiveMoney(value, locale);
  const lines = [
    state.repaying > 0 ? t("installment.walletRepaying", { amount: money(state.repaying), days: state.repayingDays ?? "—" }) : null,
    state.incoming > 0 ? t("installment.walletIncoming", { amount: money(state.incoming) }) : null,
    state.eligible && state.limit >= 1 ? t("installment.walletLine", { limit: money(state.limit) }) : null
  ].filter(Boolean);
  if (!lines.length) return null;
  return <div className="installment-line">{lines.map((line) => <small key={line}>{line}</small>)}</div>;
}
