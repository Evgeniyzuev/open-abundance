import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export type RedemptionWorkerRequest = {
  id: string;
  amount: number | string;
  network: string;
  payout_address: string;
  attempt_count?: number;
};

export type CorePayoutProvider = (request: RedemptionWorkerRequest) => Promise<{ txHash: string }>;

/**
 * Worker boundary: claiming/reserving and ledger settlement stay in RPCs;
 * the provider is injected by the one-network payout worker.
 */
export async function processCoreRedemptionRequest(requestId: string, payout: CorePayoutProvider): Promise<void> {
  const supabase = createServiceSupabaseClient() as any;
  const { data: claimed, error: claimError } = await supabase.rpc("claim_core_redemption_request", { p_request_id: requestId });
  if (claimError) throw new Error(claimError.message);

  const request = (Array.isArray(claimed) ? claimed[0] : claimed) as RedemptionWorkerRequest | null;
  if (!request) throw new Error("Redemption worker did not receive a claim.");
  if ((request as RedemptionWorkerRequest & { status?: string }).status === "paid") return;

  try {
    const payoutResult = await payout(request);
    if (!payoutResult?.txHash?.trim()) throw new Error("Payout provider returned no transaction hash.");

    const { error: completeError } = await supabase.rpc("complete_core_redemption_request", {
      p_request_id: request.id,
      p_tx_hash: payoutResult.txHash.trim()
    });
    if (completeError) throw new Error(completeError.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown payout error.";
    await supabase.rpc("fail_core_redemption_request", { p_request_id: request.id, p_error: message.slice(0, 500) });
    throw error;
  }
}
