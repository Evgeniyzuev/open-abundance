// Reserve guard (2026-11-11). On Nov 8 the reserve wallet was emptied by a transfer signed outside the app, and
// nobody noticed for three days. The guard compares each drop of the reserve balance between two treasury checks
// with what the withdrawal journal explains. An unexplained drop alerts the operators and pauses app withdrawals.
// It cannot stop someone who holds the seed; it makes the loss visible within one check and stops the app from
// signing with a wallet that may be compromised.

export type ReserveSnapshot = { ton: number | null; usdt: number | null };
export type JournalOutflow = { ton: number; usdt: number; usdtTransfers: number };

// Network fees and rounding: a TON transfer costs about 0.01 TON, a jetton transfer up to about 0.1 TON of gas.
export const TON_FEE_PER_TRANSFER = 0.15;
export const TON_TOLERANCE = 0.3;
export const USDT_TOLERANCE = 0.5;

export type GuardDecision = { unexplainedTon: number; unexplainedUsdt: number; alarm: boolean };

/**
 * `previous` and `current` are reserve balances at two checks; `journal` is everything the app may have paid out in
 * between (any withdrawal that reached signing). A balance that could not be read (null) is never an alarm.
 */
export function decideReserveGuard(previous: ReserveSnapshot, current: ReserveSnapshot, journal: JournalOutflow): GuardDecision {
  const drop = (before: number | null, after: number | null) => (before === null || after === null ? 0 : before - after);
  const round = (value: number) => Math.round(Math.max(0, value) * 1000) / 1000;
  const tonGas = journal.usdtTransfers * TON_FEE_PER_TRANSFER;
  const unexplainedTon = round(drop(previous.ton, current.ton) - journal.ton - tonGas - TON_TOLERANCE);
  const unexplainedUsdt = round(drop(previous.usdt, current.usdt) - journal.usdt - USDT_TOLERANCE);
  return { unexplainedTon, unexplainedUsdt, alarm: unexplainedTon > 0 || unexplainedUsdt > 0 };
}

type Row = Record<string, unknown>;
// A row in any of these states may already have left the wallet.
const SIGNED_STATES = ["broadcasting", "broadcast", "confirmed", "manual_review"];

/** Sums journalled payouts created or broadcast since `sinceIso` (with an hour of slack for slow confirmations). */
export function sumJournal(tonRows: Row[], usdtRows: Row[], sinceIso: string | null): JournalOutflow {
  const since = sinceIso ? Date.parse(sinceIso) - 3_600_000 : 0;
  const recent = (row: Row) => SIGNED_STATES.includes(String(row.status)) && Math.max(Date.parse(String(row.created_at ?? "")) || 0, Date.parse(String(row.broadcast_at ?? "")) || 0) >= since;
  const num = (value: unknown) => Number(value ?? 0) || 0;
  const ton = tonRows.filter(recent);
  const usdt = usdtRows.filter(recent);
  return {
    ton: ton.reduce((sum, row) => sum + num(row.amount_ton) + num(row.network_fee_reserve_ton), 0),
    usdt: usdt.reduce((sum, row) => sum + num(row.amount_usdt), 0),
    usdtTransfers: usdt.length
  };
}

/** True when the guard paused withdrawals. A missing column (migration not applied yet) means not paused. */
export async function withdrawalsPaused(supabase: { from: (table: string) => any }): Promise<boolean> {
  try {
    const { data } = await supabase.from("treasury_coverage_state").select("*").eq("id", true).maybeSingle();
    return data?.withdrawals_paused === true;
  } catch {
    return false;
  }
}
