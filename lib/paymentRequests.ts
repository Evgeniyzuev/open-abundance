export const PAYMENT_REQUEST_MAX_AMOUNT = 100_000;
export const PAYMENT_REQUEST_MAX_OPEN = 20;
export const PAYMENT_REQUEST_NOTE_MAX = 140;

/** Parses a Wallet amount with at most six decimals; returns null when it is not acceptable. */
export function parsePaymentAmount(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 && amount <= PAYMENT_REQUEST_MAX_AMOUNT ? amount : null;
}

export function cleanPaymentNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, PAYMENT_REQUEST_NOTE_MAX);
  return text || null;
}

export function paymentRequestLink(origin: string, requestId: string): string {
  return `${origin.replace(/\/+$/, "")}/?pay=${requestId}`;
}

/** Removes characters that would change a PostgREST or-filter or a LIKE pattern. */
export function cleanSearchTerm(value: string | null): string {
  return (value ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}
