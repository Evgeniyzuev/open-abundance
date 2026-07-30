export type RedemptionWorkerRequest = {
  id: string;
  amount: number | string;
  network: string;
  payout_address: string;
  attempt_count?: number;
};

export type CorePayoutProvider = (request: RedemptionWorkerRequest) => Promise<{ txHash: string }>;

/**
 * Legacy boundary retained for import compatibility. Core is strictly
 * non-decreasing, so no redemption worker may claim or pay a request.
 */
export async function processCoreRedemptionRequest(requestId: string, payout: CorePayoutProvider): Promise<void> {
  void requestId;
  void payout;
  throw new Error("Core is strictly non-decreasing and cannot be redeemed.");
}
