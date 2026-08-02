export const TON_USDT_DECIMALS = 6;

export function parseTonUsdtUnits(value: unknown, decimals = TON_USDT_DECIMALS): string | null {
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(raw) || raw === "0" || raw.length > 39) return null;
  return raw;
}

export function tonUsdtUnitsToDecimal(units: string, decimals = TON_USDT_DECIMALS): string {
  const normalized = units.replace(/^0+(?=\d)/, "") || "0";
  if (decimals === 0) return normalized;
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}