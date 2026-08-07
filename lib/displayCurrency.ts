export const DISPLAY_CURRENCIES = ["USD", "EUR", "CNY", "RUB"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export const DISPLAY_CURRENCY_SYMBOLS: Record<DisplayCurrency, string> = {
  USD: "$",
  EUR: "€",
  CNY: "¥",
  RUB: "₽"
};

export const DISPLAY_CURRENCY_STORAGE_KEY = "openAbundanceDisplayCurrency";
export const EXCHANGE_RATES_STORAGE_KEY = "openAbundanceExchangeRates";
export const EXCHANGE_RATES_TTL_MS = 10 * 60 * 1_000;
const MAX_CACHED_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = "USD";

export type ExchangeRatesSnapshot = {
  base: "USD";
  fetchedAt: string;
  provider: "twelve_data" | "bank_of_russia";
  providerTimestamp: string | null;
  rates: Record<DisplayCurrency, number>;
};

export function normalizeDisplayCurrency(value: unknown): DisplayCurrency {
  return typeof value === "string" && DISPLAY_CURRENCIES.includes(value as DisplayCurrency)
    ? (value as DisplayCurrency)
    : DEFAULT_DISPLAY_CURRENCY;
}

export function detectDisplayCurrencyPreference(): DisplayCurrency {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_CURRENCY;

  try {
    return normalizeDisplayCurrency(window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY));
  } catch {
    return DEFAULT_DISPLAY_CURRENCY;
  }
}

export function storeDisplayCurrencyPreference(currency: DisplayCurrency): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, normalizeDisplayCurrency(currency));
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
}

export function readCachedExchangeRates(now = Date.now()): ExchangeRatesSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(EXCHANGE_RATES_STORAGE_KEY);
    if (!raw) return null;
    const snapshot = normalizeExchangeRatesSnapshot(JSON.parse(raw));
    if (!snapshot) return null;

    const fetchedAtMs = Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(fetchedAtMs) || fetchedAtMs > now + 60_000 || now - fetchedAtMs > MAX_CACHED_RATE_AGE_MS) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function storeCachedExchangeRates(snapshot: ExchangeRatesSnapshot): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(EXCHANGE_RATES_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // The in-memory rates still work when storage is unavailable.
  }
}

export function normalizeExchangeRatesSnapshot(value: unknown): ExchangeRatesSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.base !== "USD") return null;
  const rateRecord = record.rates;
  if (!rateRecord || typeof rateRecord !== "object" || Array.isArray(rateRecord)) return null;

  const rates = rateRecord as Record<string, unknown>;
  const normalizedRates = {
    USD: positiveRate(rates.USD),
    EUR: positiveRate(rates.EUR),
    CNY: positiveRate(rates.CNY),
    RUB: positiveRate(rates.RUB)
  };
  if (Object.values(normalizedRates).some((rate) => rate === null)) return null;

  const fetchedAt = typeof record.fetchedAt === "string" && Number.isFinite(Date.parse(record.fetchedAt))
    ? new Date(record.fetchedAt).toISOString()
    : null;
  const providerTimestamp = typeof record.providerTimestamp === "string" && Number.isFinite(Date.parse(record.providerTimestamp))
    ? new Date(record.providerTimestamp).toISOString()
    : null;
  const provider = record.provider === "twelve_data" || record.provider === "bank_of_russia"
    ? record.provider
    : null;
  if (!fetchedAt || !provider) return null;

  return {
    base: "USD",
    fetchedAt,
    provider,
    providerTimestamp,
    rates: normalizedRates as Record<DisplayCurrency, number>
  };
}

export function areExchangeRatesFresh(snapshot: ExchangeRatesSnapshot | null, now = Date.now()): boolean {
  if (!snapshot) return false;
  const fetchedAtMs = Date.parse(snapshot.fetchedAt);
  return Number.isFinite(fetchedAtMs) && now - fetchedAtMs >= 0 && now - fetchedAtMs < EXCHANGE_RATES_TTL_MS;
}

export function exchangeRateFor(snapshot: ExchangeRatesSnapshot | null, currency: DisplayCurrency): number | null {
  if (currency === "USD") return 1;
  const rate = snapshot?.rates[currency];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

function positiveRate(value: unknown): number | null {
  const rate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
