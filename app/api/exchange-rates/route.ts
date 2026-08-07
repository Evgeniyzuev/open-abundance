import { NextResponse } from "next/server";
import { normalizeExchangeRatesSnapshot, type ExchangeRatesSnapshot } from "@/lib/displayCurrency";

export const dynamic = "force-dynamic";

const TWELVE_DATA_URL = "https://api.twelvedata.com/exchange_rate";
const CBR_DAILY_RATES_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400"
};

type TwelveDataResponse = {
  code?: number;
  message?: string;
  rate?: number;
  status?: string;
  symbol?: string;
  timestamp?: number;
};

export async function GET() {
  const fetchedAt = new Date().toISOString();
  const marketRates = await loadTwelveDataRates(fetchedAt);
  if (marketRates) return NextResponse.json(marketRates, { headers: CACHE_HEADERS });

  const fallbackRates = await loadBankOfRussiaRates(fetchedAt);
  if (fallbackRates) return NextResponse.json(fallbackRates, { headers: CACHE_HEADERS });

  return NextResponse.json(
    { error: "Exchange rates are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

async function loadTwelveDataRates(fetchedAt: string): Promise<ExchangeRatesSnapshot | null> {
  const apiKey = configuredEnvValue(process.env.TWELVE_DATA_API_KEY);
  if (!apiKey) return null;

  const pairs = ["USD/EUR", "USD/CNY", "USD/RUB"] as const;
  try {
    const rows = await Promise.all(pairs.map(async (symbol) => {
      const url = new URL(TWELVE_DATA_URL);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("apikey", apiKey);
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as TwelveDataResponse;
      const rate = positiveRate(payload.rate);
      if (!rate || payload.status === "error") return null;
      const timestamp = normalizeUnixTimestamp(payload.timestamp);
      return { rate, symbol, timestamp };
    }));
    if (rows.some((row) => row === null)) return null;

    const resolvedRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
    const bySymbol = new Map(resolvedRows.map((row) => [row.symbol, row.rate]));
    const timestamps = resolvedRows.map((row) => row.timestamp).filter((value): value is string => Boolean(value));
    return normalizeExchangeRatesSnapshot({
      base: "USD",
      fetchedAt,
      provider: "twelve_data",
      providerTimestamp: timestamps.length
        ? new Date(Math.min(...timestamps.map((value) => Date.parse(value)))).toISOString()
        : null,
      rates: {
        USD: 1,
        EUR: bySymbol.get("USD/EUR"),
        CNY: bySymbol.get("USD/CNY"),
        RUB: bySymbol.get("USD/RUB")
      }
    });
  } catch {
    return null;
  }
}

async function loadBankOfRussiaRates(fetchedAt: string): Promise<ExchangeRatesSnapshot | null> {
  try {
    const response = await fetch(CBR_DAILY_RATES_URL, {
      cache: "no-store",
      headers: { Accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) return null;

    const xml = await response.text();
    const usdRub = extractCbrRublesPerUnit(xml, "USD");
    const eurRub = extractCbrRublesPerUnit(xml, "EUR");
    const cnyRub = extractCbrRublesPerUnit(xml, "CNY");
    if (!usdRub || !eurRub || !cnyRub) return null;

    return normalizeExchangeRatesSnapshot({
      base: "USD",
      fetchedAt,
      provider: "bank_of_russia",
      providerTimestamp: extractCbrRateDate(xml),
      rates: {
        USD: 1,
        EUR: usdRub / eurRub,
        CNY: usdRub / cnyRub,
        RUB: usdRub
      }
    });
  } catch {
    return null;
  }
}

function extractCbrRublesPerUnit(xml: string, code: "USD" | "EUR" | "CNY"): number | null {
  const block = (xml.match(/<Valute\b[^>]*>[\s\S]*?<\/Valute>/gi) ?? [])
    .find((row) => new RegExp(`<CharCode>${code}</CharCode>`, "i").test(row));
  if (!block) return null;
  const nominal = positiveRate(block.match(/<Nominal>([^<]+)<\/Nominal>/i)?.[1]);
  const value = positiveRate(block.match(/<Value>([^<]+)<\/Value>/i)?.[1]?.replace(",", "."));
  return nominal && value ? value / nominal : null;
}

function extractCbrRateDate(xml: string): string | null {
  const raw = xml.match(/<ValCurs\b[^>]*\bDate="(\d{2})\.(\d{2})\.(\d{4})"/i);
  if (!raw) return null;
  const timestamp = new Date(Date.UTC(Number(raw[3]), Number(raw[2]) - 1, Number(raw[1]), 12));
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function positiveRate(value: unknown): number | null {
  const rate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function normalizeUnixTimestamp(value: unknown): string | null {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const timestamp = new Date(seconds * 1_000);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function configuredEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (
    normalized.length >= 2
    && ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    return normalized.slice(1, -1).trim() || undefined;
  }
  return normalized;
}
