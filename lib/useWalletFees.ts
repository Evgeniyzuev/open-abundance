"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

export type WalletFees = {
  deposit: { tonPercent: number; usdtTonPercent: number; cryptoPayPercent: number; cryptoPayEnabled: boolean };
  withdraw: { tonPercent: number; usdtTonPercent: number };
  p2pPercent: number;
};

let cached: WalletFees | null = null;
let pending: Promise<WalletFees | null> | null = null;

function load(): Promise<WalletFees | null> {
  if (cached) return Promise.resolve(cached);
  pending ??= fetchWithSupabaseAuth("/api/wallet/fees", { cache: "no-store" }, { authRequired: true })
    .then((response) => (response.ok ? (response.json() as Promise<WalletFees>) : null))
    .then((value) => { cached = value; return value; })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}

/** The project fees for the current session; null until loaded (the screens simply omit the fee line). */
export function useWalletFees(enabled = true): WalletFees | null {
  const [fees, setFees] = useState<WalletFees | null>(cached);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void load().then((value) => { if (!cancelled && value) setFees(value); });
    return () => { cancelled = true; };
  }, [enabled]);
  return fees;
}
