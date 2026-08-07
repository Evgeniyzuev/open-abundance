"use client";

import { useState } from "react";
import { useUserContext } from "@/components/UserProvider";

export default function CurrencyDisplayHelp() {
  const {
    displayCurrency,
    exchangeRates,
    exchangeRatesError,
    exchangeRatesLoading,
    exchangeRatesStale,
    locale,
    t
  } = useUserContext();
  const [open, setOpen] = useState(false);
  const ratesRelevant = displayCurrency !== "USD";
  const timestamp = exchangeRates?.providerTimestamp ?? exchangeRates?.fetchedAt ?? null;
  const updatedAt = timestamp
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp))
    : null;

  return (
    <span className="media-url-help currency-display-help">
      <button
        className="media-url-help-trigger"
        type="button"
        aria-label={t("profile.currency.help.open")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      {open ? (
        <span className="media-url-help-popover" role="dialog" aria-label={t("profile.currency.help.title")}>
          <strong>{t("profile.currency.help.title")}</strong>
          <p>{t("profile.currency.help.body")}</p>
          {ratesRelevant && exchangeRates && updatedAt ? (
            <p>{t("profile.currency.help.source", {
              provider: t(`profile.currency.provider.${exchangeRates.provider}`),
              time: updatedAt
            })}</p>
          ) : null}
          {ratesRelevant && exchangeRatesStale ? <p>{t("profile.currency.help.stale")}</p> : null}
          {ratesRelevant && exchangeRatesLoading ? <p>{t("profile.currency.help.loading")}</p> : null}
          {ratesRelevant && exchangeRatesError && !exchangeRates ? <p>{t("profile.currency.help.unavailable")}</p> : null}
          <button className="text-button" type="button" onClick={() => setOpen(false)}>
            {t("app.common.close")}
          </button>
        </span>
      ) : null}
    </span>
  );
}
