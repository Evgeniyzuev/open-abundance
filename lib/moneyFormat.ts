import type { AppLocale } from "@/lib/i18n";
import {
  DISPLAY_CURRENCY_SYMBOLS,
  detectDisplayCurrencyPreference,
  exchangeRateFor,
  readCachedExchangeRates,
  type DisplayCurrency
} from "@/lib/displayCurrency";

const ADAPTIVE_SIGNIFICANT_DIGITS = 3;
const MAX_ADAPTIVE_DECIMALS = 12;

function localeCode(locale: AppLocale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}

export type MoneyFormatter = {
  currency: DisplayCurrency;
  rate: number;
  symbol: string;
  format: (value: number) => string;
  formatAdaptive: (value: number) => string;
  formatRate: (value: number) => string;
  formatRounded: (value: number) => string;
};

export function createMoneyFormatter(locale: AppLocale, currency: DisplayCurrency, rate: number): MoneyFormatter {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const symbol = DISPLAY_CURRENCY_SYMBOLS[currency];
  return {
    currency,
    rate: safeRate,
    symbol,
    format: (value) => formatMoney(value, locale, currency, safeRate),
    formatAdaptive: (value) => formatAdaptiveMoney(value, locale, currency, safeRate),
    formatRate: (value) => formatRateMoney(value, locale, currency, safeRate),
    formatRounded: (value) => formatRoundedMoney(value, locale, currency, safeRate)
  };
}

export function formatMoney(value: number, locale: AppLocale, currency?: DisplayCurrency, rate?: number): string {
  const display = resolveDisplay(currency, rate);
  return formatConverted(value, locale, display.currency, display.rate, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAdaptiveMoney(value: number, locale: AppLocale, currency?: DisplayCurrency, rate?: number): string {
  const display = resolveDisplay(currency, rate);
  const safeValue = convertUsd(value, display.rate);
  if (safeValue === 0) return formatConvertedValue(0, locale, display.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (Math.abs(safeValue) >= 1) {
    return formatConvertedValue(safeValue, locale, display.currency, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  const decimals = Math.min(
    MAX_ADAPTIVE_DECIMALS,
    Math.max(2, firstNonZeroDecimalPosition(Math.abs(safeValue)) + ADAPTIVE_SIGNIFICANT_DIGITS - 1)
  );
  return formatConvertedValue(safeValue, locale, display.currency, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatRateMoney(value: number, locale: AppLocale, currency?: DisplayCurrency, rate?: number): string {
  const display = resolveDisplay(currency, rate);
  return formatConverted(value, locale, display.currency, display.rate, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function formatRoundedMoney(value: number, locale: AppLocale, currency?: DisplayCurrency, rate?: number): string {
  const display = resolveDisplay(currency, rate);
  const converted = convertUsd(value, display.rate);
  const hasFraction = Math.abs(converted % 1) > Number.EPSILON;
  const maximumFractionDigits = Math.abs(converted) < 10 && hasFraction ? 2 : 0;
  return formatConvertedValue(converted, locale, display.currency, { maximumFractionDigits });
}

function resolveDisplay(currency?: DisplayCurrency, rate?: number): { currency: DisplayCurrency; rate: number } {
  if (currency) return { currency, rate: Number.isFinite(rate) && Number(rate) > 0 ? Number(rate) : 1 };
  if (typeof window === "undefined") return { currency: "USD", rate: 1 };

  const preferredCurrency = detectDisplayCurrencyPreference();
  const preferredRate = exchangeRateFor(readCachedExchangeRates(), preferredCurrency);
  return preferredRate
    ? { currency: preferredCurrency, rate: preferredRate }
    : { currency: "USD", rate: 1 };
}

function formatConverted(
  value: number,
  locale: AppLocale,
  currency: DisplayCurrency,
  rate: number,
  options: Intl.NumberFormatOptions
): string {
  return formatConvertedValue(convertUsd(value, rate), locale, currency, options);
}

function formatConvertedValue(value: number, locale: AppLocale, currency: DisplayCurrency, options: Intl.NumberFormatOptions): string {
  return `${new Intl.NumberFormat(localeCode(locale), options).format(value)} ${DISPLAY_CURRENCY_SYMBOLS[currency]}`;
}

function convertUsd(value: number, rate: number): number {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return safeValue * safeRate;
}

function firstNonZeroDecimalPosition(value: number): number {
  let scaled = Math.abs(value);
  for (let position = 1; position <= MAX_ADAPTIVE_DECIMALS; position += 1) {
    scaled *= 10;
    if (Math.floor(scaled) > 0) return position;
  }
  return 4;
}
