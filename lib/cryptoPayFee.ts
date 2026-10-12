// The provider keeps a percentage of what is paid. So that the project never pays for a deposit, the invoice is
// raised so that, after the provider's share, exactly the amount the person chose reaches the project.
// Pure and import-free: used by the server and by the deposit screen (tested directly by node).

/** Amount to invoice so that `credit` remains after a `feePercent` share, rounded up to a whole cent. */
export function grossUpForFee(credit: number, feePercent: number): number {
  const percent = Math.min(Math.max(feePercent, 0), 50);
  if (percent === 0) return Math.round(credit * 100) / 100;
  return Math.ceil(Math.round((credit / (1 - percent / 100)) * 10_000) / 100) / 100;
}
