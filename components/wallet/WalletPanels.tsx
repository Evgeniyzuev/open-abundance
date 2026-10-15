"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Check, ChevronDown, ChevronUp, RotateCcw, TrendingUp } from "lucide-react";
import { UserNameWithLevel } from "@/components/UserLevelBadge";
import { type CoreAccount } from "@/components/UserProvider";
import { calculateDailyIncome, daysFromTerm, findDaysToTarget, normalizePercent } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney, formatMoney } from "@/lib/moneyFormat";
import { ExchangeOffers, MutualBalanceCard } from "@/components/MarketExchange";
import { SacredShop } from "@/components/SacredShop";
import type { CalculatorMode, TargetKind, TermUnit, TFunction, MarketplaceListing, MarketplaceDeal, EconomyPeriodType, EconomyMetricRow } from "@/components/wallet/walletTypes";
import { buildComparisonSeries, linePath, xForDay, yForValue, formatIndexTick, formatIndexValue, formatAnnualReturn, formatChartTick, formatPercentCompact, sellerName, artifactInitial, parseNumber, clamp, unitLabel, formatDuration, formatTargetDate } from "@/components/wallet/walletHelpers";
import { ComparisonInfoModal, FinanceState } from "@/components/wallet/WalletModals";

export function EconomyMetricsPanel({
  metric,
  periodType,
  loading,
  error,
  publicEnabled,
  publicSaving,
  locale,
  t,
  onPeriodChange,
  onTogglePublic
}: {
  metric: EconomyMetricRow | null;
  periodType: EconomyPeriodType;
  loading: boolean;
  error: string | null;
  publicEnabled: boolean;
  publicSaving: boolean;
  locale: AppLocale;
  t: TFunction;
  onPeriodChange: (periodType: EconomyPeriodType) => void;
  onTogglePublic: () => void;
}) {
  const periods: EconomyPeriodType[] = ["day", "month", "year", "lifetime"];
  const value = (amount: number | null | undefined) => formatAdaptiveMoney(Number(amount ?? 0), locale);
  // Folded by default and remembered on this device: the figures are for reference, not for every visit.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(window.localStorage.getItem("oa-economy-open.v1") === "1"); } catch { /* stays folded */ }
  }, []);
  function toggleOpen() {
    setOpen((current) => {
      try { window.localStorage.setItem("oa-economy-open.v1", current ? "0" : "1"); } catch { /* not remembered */ }
      return !current;
    });
  }

  return (
    <section className={open ? "economy-metrics-panel" : "economy-metrics-panel is-folded"} aria-labelledby="economy-metrics-title">
      <button className="economy-metrics-header economy-metrics-toggle" type="button" aria-expanded={open} aria-controls="economy-metrics-body" onClick={toggleOpen}>
        <div>
          <h2 id="economy-metrics-title">{t("wallet.economy.title")}</h2>
          {open ? <p>{t("wallet.economy.explainer")}</p> : null}
        </div>
        <span className={metric?.is_reconciled ? "economy-status is-verified" : "economy-status"}>
          {metric?.is_reconciled ? t("wallet.economy.verified") : t("wallet.economy.stale")}
        </span>
        {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>
      {open ? (
      <div className="economy-metrics-body" id="economy-metrics-body">
      <div className="economy-period-switcher" role="group" aria-label={t("wallet.economy.title")}>
        {periods.map((period) => (
          <button
            className={period === periodType ? "is-active" : ""}
            key={period}
            type="button"
            aria-pressed={period === periodType}
            onClick={() => onPeriodChange(period)}
          >
            {t(`wallet.economy.period.${period}` as MessageKey)}
          </button>
        ))}
      </div>
      <label className="economy-public-toggle">
        <input type="checkbox" checked={publicEnabled} disabled={publicSaving} onChange={onTogglePublic} />
        <span>{t("wallet.economy.publicToggle")}</span>
        <small>{publicSaving ? t("wallet.economy.publicSaving") : publicEnabled ? t("wallet.economy.publicOn") : t("wallet.economy.publicOff")}</small>
      </label>
      {loading && !metric ? <p className="economy-metrics-state">{t("wallet.economy.loading")}</p> : null}
      {error ? <p className="economy-metrics-state is-error">{t("wallet.economy.error")}</p> : null}
      {metric ? (
        <div className="economy-metrics-grid">
          <EconomyMetricCard label={t("wallet.economy.inflows")} value={value(metric.wallet_inflows_total)} />
          <EconomyMetricCard label={t("wallet.economy.outflows")} value={value(metric.wallet_outflows_total)} />
          <EconomyMetricCard label={t("wallet.economy.marketplacePurchases")} value={value(metric.marketplace_purchases_gross)} />
          <EconomyMetricCard label={t("wallet.economy.marketplaceSales")} value={value(metric.marketplace_sales_gross)} />
          <EconomyMetricCard label={t("wallet.economy.participation")} value={value(metric.participation_balance)} />
          <EconomyMetricCard label={t("wallet.economy.coreGrowth")} value={value(metric.core_growth_total)} />
        </div>
      ) : null}
      </div>
      ) : null}
    </section>
  );
}

export function EconomyMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="economy-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function HistoryPanel({
  title,
  open,
  loading,
  error,
  emptyText,
  loadingText,
  rowCount,
  onToggle,
  children
}: {
  title: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  emptyText: string;
  loadingText: string;
  rowCount: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  const hasRows = rowCount > 0;

  return (
    <section className="history-section">
      <button className="history-toggle" type="button" onClick={onToggle}>
        <span>{title}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open ? (
        <div className="history-body">
          {loading ? <p>{loadingText}</p> : null}
          {error ? <p className="finance-error">{error}</p> : null}
          {!error && hasRows ? children : null}
          {!loading && !error && !hasRows ? <p>{emptyText}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function ReinvestPanel({
  value,
  savedPercent,
  dailyIncome,
  valid,
  changed,
  saving,
  error,
  locale,
  t,
  onChange,
  onReset,
  onSave
}: {
  value: string;
  savedPercent: number;
  dailyIncome: ReturnType<typeof calculateDailyIncome>;
  valid: boolean;
  changed: boolean;
  saving: boolean;
  error: string | null;
  locale: AppLocale;
  t: TFunction;
  onChange: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const percent = valid ? normalizePercent(parseNumber(value)) : savedPercent;

  return (
    <section className="core-tool-panel reinvest-panel">
      <div className="core-tool-heading">
        <div>
          <span>{t("wallet.reinvest")}</span>
          <strong>{formatPercentCompact(percent, locale)} {t("wallet.toCore")}</strong>
        </div>
        <div className="reinvest-actions">
          {changed ? (
            <button className="finance-small-icon-button" type="button" aria-label={t("app.common.reset")} disabled={saving} onClick={onReset}>
              <RotateCcw size={16} />
            </button>
          ) : null}
          <button className="finance-small-icon-button primary" type="button" aria-label={t("app.common.save")} disabled={!changed || !valid || saving} onClick={onSave}>
            <Check size={17} />
          </button>
        </div>
      </div>

      <div className="reinvest-control-row">
        <input
          className={valid ? "finance-number-input" : "finance-number-input invalid"}
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t("wallet.reinvest.percent")}
        />
        <span>%</span>
        <input
          className="reinvest-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={valid ? String(Math.round(percent)) : String(Math.round(savedPercent))}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t("wallet.reinvest.slider")}
        />
      </div>

      <div className="reinvest-split">
        <span>
          <TrendingUp size={15} />
          {t("wallet.core")} +{formatAdaptiveMoney(dailyIncome.toCore, locale)}
        </span>
        <span>{t("wallet.wallet")} +{formatAdaptiveMoney(dailyIncome.toWallet, locale)}</span>
      </div>

      {!valid ? <p className="finance-error inline">{t("wallet.reinvest.invalidPercent")}</p> : null}
      {error ? <p className="finance-error inline">{error}</p> : null}
    </section>
  );
}

export function CoreCalculatorPanel({
  open,
  mode,
  targetKind,
  useCurrentCore,
  startCore,
  dailyAdditions,
  simulationReinvest,
  termValue,
  termUnit,
  targetCore,
  targetDailyIncome,
  futureCore,
  futureDailyIncome,
  targetCalculation,
  requestedTargetCore,
  summaryGoalLabel,
  summaryDailyLabel,
  locale,
  t,
  onToggle,
  onModeChange,
  onTargetKindChange,
  onUseCurrentCoreChange,
  onStartCoreChange,
  onDailyAdditionsChange,
  onSimulationReinvestChange,
  onTermValueChange,
  onTermUnitChange,
  onTargetCoreChange,
  onTargetDailyIncomeChange,
  targetCalculationTouched,
  onCalculateTarget
}: {
  open: boolean;
  mode: CalculatorMode;
  targetKind: TargetKind;
  useCurrentCore: boolean;
  startCore: string;
  dailyAdditions: string;
  simulationReinvest: string;
  termValue: string;
  termUnit: TermUnit;
  targetCore: string;
  targetDailyIncome: string;
  futureCore: number;
  futureDailyIncome: ReturnType<typeof calculateDailyIncome>;
  targetCalculation: ReturnType<typeof findDaysToTarget>;
  requestedTargetCore: number;
  summaryGoalLabel: string;
  summaryDailyLabel: string;
  locale: AppLocale;
  t: TFunction;
  onToggle: () => void;
  onModeChange: (mode: CalculatorMode) => void;
  onTargetKindChange: (kind: TargetKind) => void;
  onUseCurrentCoreChange: (checked: boolean) => void;
  onStartCoreChange: (value: string) => void;
  onDailyAdditionsChange: (value: string) => void;
  onSimulationReinvestChange: (value: string) => void;
  onTermValueChange: (value: string) => void;
  onTermUnitChange: (unit: TermUnit) => void;
  onTargetCoreChange: (value: string) => void;
  onTargetDailyIncomeChange: (value: string) => void;
  targetCalculationTouched: boolean;
  onCalculateTarget: () => void;
}) {
  const targetReady = targetCalculationTouched && mode === "target";
  const manualAdded = Math.max(0, parseNumber(dailyAdditions)) * daysFromTerm(parseNumber(termValue), termUnit);
  const reinvestGrowth = Math.max(0, futureCore - Math.max(0, parseNumber(startCore)) - manualAdded);

  return (
    <section className={open ? "core-tool-panel calculator-panel open" : "core-tool-panel calculator-panel"}>
      <button className="calculator-summary" type="button" onClick={onToggle}>
        <span className="calculator-title">
          <Calculator size={18} />
          {t("wallet.calculator.title")}
        </span>
        <span className="calculator-metrics">
          <span>
            <small>{mode === "target" ? t("wallet.calculator.goal") : mode === "compare" ? t("wallet.calculator.period") : t("wallet.calculator.futureCore")}</small>
            <strong>{summaryGoalLabel}</strong>
          </span>
          <span>
            <small>{mode === "target" ? t("wallet.calculator.requiredCore") : mode === "compare" ? t("wallet.calculator.futureCore") : t("wallet.calculator.daily")}</small>
            <strong>{summaryDailyLabel}</strong>
          </span>
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open ? (
        <div className="calculator-body">
          <div className="finance-segmented calculator-tabs">
            <button className={mode === "future" ? "active" : ""} type="button" onClick={() => onModeChange("future")}>
              {t("wallet.calculator.futureAmount")}
            </button>
            <button className={mode === "target" ? "active" : ""} type="button" onClick={() => onModeChange("target")}>
              {t("wallet.calculator.timeToGoal")}
            </button>
            <button className={mode === "compare" ? "active" : ""} type="button" onClick={() => onModeChange("compare")}>
              {t("wallet.calculator.comparison")}
            </button>
          </div>

          <div className="calculator-grid">
            <div className="calculator-fields">
              <label className="finance-field">
                <span>{t("wallet.calculator.startCore")}</span>
                <input type="number" min="0" inputMode="decimal" value={startCore} onChange={(event) => onStartCoreChange(event.target.value)} />
              </label>

              <label className="finance-check-row">
                <input type="checkbox" checked={useCurrentCore} onChange={(event) => onUseCurrentCoreChange(event.target.checked)} />
                <span>{t("wallet.calculator.useCurrentCore")}</span>
              </label>

              <label className="finance-field">
                <span>{t("wallet.calculator.dailyAdditions")}</span>
                <input type="number" min="0" inputMode="decimal" value={dailyAdditions} onChange={(event) => onDailyAdditionsChange(event.target.value)} />
              </label>

              <label className="finance-field">
                <span>{t("wallet.calculator.scenarioReinvest")}</span>
                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={simulationReinvest} onChange={(event) => onSimulationReinvestChange(event.target.value)} />
              </label>

              {mode !== "target" ? (
                <div className="term-row">
                  <label className="finance-field">
                    <span>{t("wallet.calculator.term")}</span>
                    <input type="number" min="0" inputMode="decimal" value={termValue} onChange={(event) => onTermValueChange(event.target.value)} />
                  </label>
                  <div className="finance-segmented small">
                    {(["days", "months", "years"] as TermUnit[]).map((unit) => (
                      <button className={termUnit === unit ? "active" : ""} type="button" key={unit} onClick={() => onTermUnitChange(unit)}>
                        {unitLabel(unit, t)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="finance-segmented compact">
                    <button className={targetKind === "core" ? "active" : ""} type="button" onClick={() => onTargetKindChange("core")}>
                      Core
                    </button>
                    <button className={targetKind === "daily" ? "active" : ""} type="button" onClick={() => onTargetKindChange("daily")}>
                      {t("wallet.calculator.dailyIncomeShort")}
                    </button>
                  </div>
                  {targetKind === "core" ? (
                    <label className="finance-field">
                      <span>{t("wallet.calculator.goalCore")}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetCore} onChange={(event) => onTargetCoreChange(event.target.value)} />
                    </label>
                  ) : (
                    <label className="finance-field">
                      <span>{t("wallet.calculator.goalDailyIncome")}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetDailyIncome} onChange={(event) => onTargetDailyIncomeChange(event.target.value)} />
                    </label>
                  )}
                  <button className="challenge-primary-action calculator-action" type="button" onClick={onCalculateTarget}>
                    {t("wallet.calculator.calculateTime")}
                  </button>
                </>
              )}
            </div>

            <div className="calculator-results">
              {mode === "future" ? (
                <>
                  <MetricRow label={t("wallet.calculator.futureCore")} value={formatMoney(futureCore, locale)} strong />
                  <MetricRow label={t("wallet.calculator.dailyIncome")} value={`${formatMoney(futureDailyIncome.gross, locale)}/${t("app.common.day")}`} />
                  <MetricRow label={t("wallet.calculator.addedManually")} value={formatMoney(manualAdded, locale)} />
                  <MetricRow label={t("wallet.calculator.reinvestGrowth")} value={formatMoney(reinvestGrowth, locale)} />
                </>
              ) : mode === "target" ? (
                <>
                  <MetricRow label={t("wallet.calculator.requiredCore")} value={formatMoney(requestedTargetCore, locale)} strong />
                  {targetReady ? <TargetResult calculation={targetCalculation} locale={locale} t={t} /> : (
                    <p className="calculator-hint">{t("wallet.calculator.targetHint")}</p>
                  )}
                </>
              ) : (
                <GrowthComparisonChart
                  locale={locale}
                  t={t}
                  reinvestPercent={parseNumber(simulationReinvest)}
                  days={daysFromTerm(parseNumber(termValue), termUnit)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MetricRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "metric-row strong" : "metric-row"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function TargetResult({ calculation, locale, t }: { calculation: ReturnType<typeof findDaysToTarget>; locale: AppLocale; t: TFunction }) {
  if (calculation.kind === "reached") {
    return <MetricRow label={t("wallet.calculator.time")} value={t("wallet.calculator.alreadyReached")} strong />;
  }

  if (calculation.kind === "unreachable") {
    return <p className="calculator-hint">{t("wallet.calculator.unreachableHint")}</p>;
  }

  if (calculation.kind === "beyond-range") {
    return <p className="calculator-hint">{t("wallet.calculator.beyondRangeHint")}</p>;
  }

  return (
    <>
      <MetricRow label={t("wallet.calculator.time")} value={formatDuration(calculation.days, t)} strong />
      <MetricRow label={t("wallet.calculator.targetDate")} value={formatTargetDate(calculation.days, locale)} />
    </>
  );
}

export function BalancePanel({
  title,
  label,
  amount,
  meta,
  locale,
  adaptiveAmount = false
}: {
  title: string;
  label: string;
  amount: number;
  meta: string;
  locale: AppLocale;
  adaptiveAmount?: boolean;
}) {
  return (
    <section className="balance-panel">
      <span>{title}</span>
      <small>{label}</small>
      <strong>{adaptiveAmount ? formatAdaptiveMoney(amount, locale) : formatMoney(amount, locale)}</strong>
      <p>{meta}</p>
    </section>
  );
}

export function CoreLevelProgress({
  core,
  locale,
  t,
  onOpen
}: {
  core: CoreAccount;
  locale: AppLocale;
  t: TFunction;
  onOpen: () => void;
}) {
  const threshold = Number.isFinite(core.next_level_threshold ?? NaN) && (core.next_level_threshold ?? 0) > 0 ? core.next_level_threshold ?? null : null;
  const progress = threshold ? clamp((core.balance / threshold) * 100, 0, 100) : 100;
  // Whole percent, rounded down: the panel never reads 100% because at 100% the level has risen.
  const displayProgress = threshold ? Math.min(99, Math.floor(progress)) : 100;
  const chargeClass = progress >= 80 ? " high-charge" : progress >= 40 ? " medium-charge" : "";

  return (
    <section className={`core-level-panel is-interactive${chargeClass}`} aria-label={t("wallet.coreProgress.aria")}>
      <button className="core-level-open" type="button" aria-label={t("core.sheet.open")} onClick={onOpen} />
      <div className="core-reactor" aria-hidden="true">
        <span className="core-reactor-halo" />
        <span className="core-reactor-orb">
          <span className="core-reactor-energy" />
          <span className="core-reactor-nucleus" />
        </span>
      </div>
      <div className="core-level-content">
        <div className="core-level-head">
          <span className="core-level-label">
            {t("app.common.level")} {core.level}
            {threshold ? <b className="core-level-percent">{displayProgress}%</b> : null}
          </span>
          <strong>{threshold ? `${formatAdaptiveMoney(core.balance, locale)} / ${formatAdaptiveMoney(threshold, locale)}` : t("wallet.coreProgress.max")}</strong>
        </div>
        <div
          className="core-level-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={threshold ?? Math.max(1, core.balance)}
          aria-valuenow={threshold ? Math.min(core.balance, threshold) : Math.max(1, core.balance)}
        >
          <div className="core-level-fill" style={{ width: `${displayProgress}%` }} />
        </div>
      </div>
    </section>
  );
}

export function MarketplacePanel({
  listings,
  loading,
  error,
  locale,
  listingLimit,
  openListingCount,
  t,
  userId,
  savingId,
  deals,
  dealSavingId,
  onCancel,
  onBuy,
  onExchange,
  exchangeRefreshKey = 0,
  onExchangeChanged,
  onView,
  onDealAction,
  onReview,
  onSell
}: {
  listings: MarketplaceListing[];
  loading: boolean;
  error: string | null;
  locale: AppLocale;
  listingLimit: number;
  openListingCount: number;
  t: TFunction;
  userId: string;
  savingId: string | null;
  deals: MarketplaceDeal[];
  dealSavingId: string | null;
  onCancel: (listingId: string) => void;
  onBuy: (listingId: string) => void;
  onExchange?: (listingId: string) => void;
  exchangeRefreshKey?: number;
  onExchangeChanged?: () => void;
  onView: (listingId: string) => void;
  onDealAction: (dealId: string, action: "accept" | "cancel" | "deliver" | "confirm" | "dispute") => void;
  onReview: (dealId: string) => void;
  onSell: () => void;
}) {
  const canCreate = openListingCount < listingLimit;

  return (
    <section className="market-panel">
      <div className="market-head">
        <div>
          <span>{t("market.kicker")}</span>
          <strong>{t("market.title")}</strong>
          <small>{t("market.limit", { count: openListingCount, limit: listingLimit })}</small>
        </div>
        <button className="challenge-primary-action" type="button" disabled={!canCreate} onClick={onSell}>
          {t("market.sell")}
        </button>
      </div>
      <MutualBalanceCard refreshKey={exchangeRefreshKey + deals.length} />
      <SacredShop onPurchased={() => onExchangeChanged?.()} />
      {error ? <p className="finance-error">{error}</p> : null}
      {loading && listings.length === 0 ? <FinanceState title={t("app.common.loading")} description={t("market.loading")} /> : null}
      {!loading && listings.length === 0 ? <FinanceState title={t("market.emptyTitle")} description={canCreate ? t("market.emptyWithItems") : t("market.limitReached")} /> : null}
      {listings.length > 0 ? (
        <div className="market-grid">
          {listings.map((listing) => {
            const own = listing.seller_user_id === userId;
            return (
              <article className="market-card" key={listing.id}>
                <div className="market-card-image">
                  {listing.image_url ?? listing.artifact?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={listing.image_url ?? listing.artifact?.image_url ?? ""} alt="" />
                  ) : (
                    <span>{artifactInitial(listing)}</span>
                  )}
                  <small>{listing.artifact?.rarity ?? "common"}</small>
                </div>
                <div className="market-card-body">
                  <strong>{listing.title}</strong>
                  {listing.description ? <p>{listing.description}</p> : null}
                  <div className="market-card-meta">
                    <span>{formatAdaptiveMoney(Number(listing.price_amount), locale)}</span>
                    <small>{listing.sales_count ?? 0} · ★ {listing.rating_count ? (Number(listing.rating_sum ?? 0) / Number(listing.rating_count)).toFixed(1) : "—"}</small>
                    <small>
                      {own ? t("market.yours") : (
                        <UserNameWithLevel
                          label={listing.sellerProfile ? t("profile.levelBadge", { level: listing.sellerProfile.level }) : undefined}
                          level={listing.sellerProfile?.level}
                        >
                          {sellerName(listing)}
                        </UserNameWithLevel>
                      )}
                    </small>
                  </div>
                  {own ? (
                    <div className="market-card-actions">
                      <button className="text-button" type="button" onClick={() => onView(listing.id)}>{t("market.details")}</button>
                      <button className="text-button danger" type="button" disabled={savingId === listing.id} onClick={() => onCancel(listing.id)}>
                        {savingId === listing.id ? t("app.common.loading") : t("market.cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="market-card-actions">
                      <button className="text-button" type="button" onClick={() => onView(listing.id)}>{t("market.details")}</button>
                      <button className="text-button" type="button" disabled={dealSavingId === listing.id} onClick={() => onBuy(listing.id)}>
                        {dealSavingId === listing.id ? t("app.common.loading") : t("market.buy")}
                      </button>
                      {onExchange ? (
                        <button className="text-button" type="button" onClick={() => onExchange(listing.id)}>{t("market.exchange.short")}</button>
                      ) : null}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      <ExchangeOffers refreshKey={exchangeRefreshKey} onChanged={() => onExchangeChanged?.()} />
      {deals.length > 0 ? (
        <div className="market-deals">
          <strong>{t("market.myDeals")}</strong>
          {deals.map((deal) => {
            const buying = deal.buyer_user_id === userId;
            return (
              <article className="market-card" key={deal.id}>
                <div className="market-card-body">
                  <strong>{t("market.dealStatus", { status: deal.status })}</strong>
                  <span>{formatAdaptiveMoney(Number(deal.price_amount), locale)}</span>
                  {deal.status === "awaiting_seller" && deal.expires_at ? <small>{t("market.timer")}: {new Date(deal.expires_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small> : null}
                  {deal.status === "accepted" && deal.delivery_due_at ? <small>{t("market.timer")}: {new Date(deal.delivery_due_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small> : null}
                  {deal.status === "delivered" && deal.delivered_at ? <small>{t("market.timer")}: {new Date(deal.delivered_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small> : null}
                  <div className="market-card-actions">
                    {deal.status === "awaiting_seller" && !buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "accept")}>{t("market.accept")}</button> : null}
                    {deal.status === "accepted" && !buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "deliver")}>{t("market.deliver")}</button> : null}
                    {deal.status === "delivered" && buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "confirm")}>{t("market.confirm")}</button> : null}
                    {deal.status === "completed" && buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onReview(deal.id)}>{t("market.review")}</button> : null}
                    {(deal.status === "accepted" || deal.status === "delivered") ? <button className="text-button danger" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "dispute")}>{t("market.dispute")}</button> : null}
                    {deal.status === "awaiting_seller" ? <button className="text-button danger" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "cancel")}>{t("market.cancelDeal")}</button> : null}
                  </div>
                  {deal.events?.length ? (
                    <details className="market-deal-events">
                      <summary>{t("market.events")}</summary>
                      <ol>
                        {deal.events.map((event) => (
                          <li key={event.id}>
                            <span>{event.event_type}</span>
                            <small>{new Date(event.created_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function GrowthComparisonChart({
  locale,
  t,
  reinvestPercent,
  days
}: {
  locale: AppLocale;
  t: TFunction;
  reinvestPercent: number;
  days: number;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const series = buildComparisonSeries({ locale, reinvestPercent, days });
  const maxValue = Math.max(125, ...series.flatMap((line) => line.points.map((point) => point.value)));
  const yMax = Math.ceil(maxValue / 25) * 25;
  const width = 320;
  const height = 188;
  const plot = { left: 38, top: 14, width: 266, height: 126 };
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => yMax * ratio);
  const ticks = Array.from(new Set([0, Math.round(days / 2), Math.round(days)]));

  return (
    <div className="comparison-chart">
      <div className="comparison-head">
        <span className="comparison-title-row">
          {t("wallet.calculator.comparisonTitle")}
          <button className="info-button comparison-info-button" type="button" aria-label={t("wallet.calculator.comparisonInfoButton")} onClick={() => setInfoOpen(true)}>i</button>
        </span>
        <strong>{t("wallet.calculator.comparisonPeriod", { period: formatDuration(days, t) })}</strong>
      </div>
      <svg className="comparison-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("wallet.calculator.comparisonChartAria")}>
        {gridValues.map((value) => {
          const y = yForValue(value, yMax, plot);
          return (
            <g key={value}>
              <line x1={plot.left} y1={y} x2={plot.left + plot.width} y2={y} />
              <text x={plot.left - 8} y={y + 4}>{formatIndexTick(value, locale)}</text>
            </g>
          );
        })}
        {ticks.map((value) => (
          <text className="comparison-x-label" key={value} x={xForDay(value, days, plot)} y={height - 12}>
            {formatChartTick(value, t)}
          </text>
        ))}
        {series.map((line) => (
          <path key={line.id} d={linePath(line.points, days, yMax, plot)} stroke={line.color}>
            <title>{`${line.label}: ${formatIndexValue(line.finalIndex, locale)} - ${formatAnnualReturn(line.annualReturn, locale, t)}`}</title>
          </path>
        ))}
      </svg>
      <div className="comparison-legend">
        {series.map((line) => (
          <span key={line.id}>
            <i style={{ backgroundColor: line.color }} />
            {line.label}
            <strong>{formatIndexValue(line.finalIndex, locale)} - {formatAnnualReturn(line.annualReturn, locale, t)}</strong>
          </span>
        ))}
      </div>
      {infoOpen ? <ComparisonInfoModal t={t} onClose={() => setInfoOpen(false)} /> : null}
    </div>
  );
}

