// Pure rules of the sales, wish and team-task challenges (no imports, tested directly by node).

/** The sales total a "sales_total_N" check asks for, in $; null for any other check. */
export function salesThreshold(logic: string | null | undefined): number | null {
  const match = logic?.match(/^sales_total_(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Sum of the prices of completed sales; a bad number counts as zero. */
export function sumCompletedSales(prices: Array<number | string | null | undefined>): number {
  return prices.reduce<number>((sum, price) => {
    const value = Number(price);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
}
