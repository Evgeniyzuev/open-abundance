/**
 * Decides whether a sender address looks like a personal wallet. Binding an address means later
 * deposits from it are credited without a comment, so a shared address (an exchange hot wallet or a
 * payment service) must never be bound: it would credit one person with everyone's deposits.
 *
 * The rule is intentionally simple. A personal wallet rarely makes dozens of transactions within
 * half a day; exchange and service wallets make thousands. Pure, no imports, so it is covered by
 * `pnpm test:usdt-binding`.
 */

export const BUSY_SENDER_SAMPLE = 50;
export const BUSY_SENDER_WINDOW_SECONDS = 12 * 60 * 60;

/** `utimes` are the Unix times of the most recent transactions of the address. */
export function isBusySenderActivity(utimes: number[]): boolean {
  const times = utimes.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => b - a);
  if (times.length < BUSY_SENDER_SAMPLE) return false;
  return times[0] - times[BUSY_SENDER_SAMPLE - 1] < BUSY_SENDER_WINDOW_SECONDS;
}

export type SenderEligibility = "eligible" | "busy" | "unknown";

/**
 * Looks at recent activity of the sender through TON Center. When the lookup fails the result is
 * "unknown" and the caller must not bind: the deposit is still credited by its comment, and the
 * person can bind on the next payment.
 */
export async function checkSenderEligibility(restEndpoint: string, address: string, apiKey?: string): Promise<SenderEligibility> {
  try {
    const url = new URL(`${restEndpoint.replace(/\/+$/, "")}/getTransactions`);
    url.searchParams.set("address", address);
    url.searchParams.set("limit", String(BUSY_SENDER_SAMPLE));
    const headers: HeadersInit = { Accept: "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const response = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(10_000) });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: Array<{ utime?: number }> };
    if (!response.ok || payload.ok === false || !Array.isArray(payload.result)) return "unknown";
    return isBusySenderActivity(payload.result.map((tx) => Number(tx.utime))) ? "busy" : "eligible";
  } catch {
    return "unknown";
  }
}
