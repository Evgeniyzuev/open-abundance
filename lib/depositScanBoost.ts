/**
 * Asks the deposit pipeline (pg_cron, run_ton_deposit_pipeline) to scan the chain every 15 seconds for the next
 * 10 minutes. Without it the scans run once every 5 minutes, which keeps Vercel function calls low while nobody is
 * paying. Best effort: a failed boost only means a slower credit.
 */
export async function boostDepositScan(supabase: unknown, asset: "TON" | "USDT"): Promise<void> {
  try {
    await (supabase as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown> }).rpc("boost_deposit_scan", { p_asset: asset });
  } catch {
    // Ignore: the 5-minute safety scan still credits the payment.
  }
}
