const TON_DECIMALS = 9;

export function tonAmountToNano(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,9})?$/.test(normalized)) return null;

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "");
  const nano = `${whole}${fractionalPart.padEnd(TON_DECIMALS, "0")}`.replace(/^0+/, "") || "0";
  return nano === "0" || nano.length > 39 ? null : nano;
}

export function nanoToTonAmount(value: string | null | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null;

  const padded = value.padStart(TON_DECIMALS + 1, "0");
  const whole = padded.slice(0, -TON_DECIMALS).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(-TON_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
