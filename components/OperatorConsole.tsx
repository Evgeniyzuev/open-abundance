"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import type { TreasuryCoverageReport } from "@/lib/treasuryCoverage";
import type { EconomyReport } from "@/lib/economyReport";

type WithdrawalRow = {
  id: string;
  asset: "TON" | "USDT";
  amount: number | string | null;
  payoutWalletAmount: number | string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  transactionHash: string | null;
  userId: string;
  createdAt: string;
};

type WithdrawalsPayload = {
  withdrawals: WithdrawalRow[];
  limits: { enabled: boolean; perUserDaily: number; globalDaily: number; usedLast24h: number } | null;
};

type Recommendation = {
  id: string;
  kind: string;
  title: string;
  rationale: string;
  expected_effect: string;
  risk: string;
  target_user_ids: string[];
};

type ListingOnReview = {
  id: string;
  title: string;
  description: string | null;
  price: string;
  sellerUserId: string;
  flags: string[];
};

const LIGHT_COLORS: Record<string, string> = { green: "#1a9b57", yellow: "#d99a00", red: "#d33a3a", black: "#111111", unknown: "#7a7f87" };
const ATTENTION_STATUSES = new Set(["manual_review", "failed"]);

export default function OperatorConsole({ onClose }: { onClose: () => void }) {
  const { t } = useUserContext();
  const [report, setReport] = useState<TreasuryCoverageReport | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Recommendation[]>([]);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [nudges, setNudges] = useState<Array<{ user: string; step: string }> | null>(null);
  const [nudgeBusy, setNudgeBusy] = useState(false);
  const [listings, setListings] = useState<ListingOnReview[] | null>(null);
  const [listingBusy, setListingBusy] = useState(false);
  const [economy, setEconomy] = useState<EconomyReport | null>(null);

  const loadListings = useCallback(async () => {
    setListingBusy(true);
    try {
      const response = await fetchWithSupabaseAuth("/api/internal/marketplace/review", { cache: "no-store" }, { authRequired: true });
      if (response.ok) setListings(((await response.json()) as { items: ListingOnReview[] }).items);
    } catch {
      // The review queue is optional; the rest of the console keeps working.
    } finally {
      setListingBusy(false);
    }
  }, []);

  async function reviewListing(id: string, status: "approved" | "rejected") {
    setListingBusy(true);
    try {
      await fetchWithSupabaseAuth(
        "/api/internal/marketplace/review",
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) },
        { authRequired: true }
      );
    } finally {
      await loadListings();
    }
  }

  const loadProposals = useCallback(async (generate: boolean) => {
    setProposalBusy(true);
    try {
      if (generate) await fetchWithSupabaseAuth("/api/internal/coordinator/digest?propose=1", { cache: "no-store" }, { authRequired: true });
      const response = await fetchWithSupabaseAuth("/api/internal/coordinator/recommendations", { cache: "no-store" }, { authRequired: true });
      if (response.ok) setProposals(((await response.json()) as { items: Recommendation[] }).items);
    } catch {
      // The treasury panel stays usable if the coordinator queue is unavailable.
    } finally {
      setProposalBusy(false);
    }
  }, []);

  const previewNudges = useCallback(async () => {
    setNudgeBusy(true);
    try {
      const response = await fetchWithSupabaseAuth("/api/internal/coordinator/nudges", { cache: "no-store" }, { authRequired: true });
      if (response.ok) setNudges(((await response.json()) as { planned: Array<{ user: string; step: string }> }).planned);
    } catch {
      // The preview is optional; the rest of the console keeps working.
    } finally {
      setNudgeBusy(false);
    }
  }, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setProposalBusy(true);
    try {
      await fetchWithSupabaseAuth(
        "/api/internal/coordinator/recommendations",
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) },
        { authRequired: true }
      );
    } finally {
      await loadProposals(false);
    }
  }

  const loadEconomy = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth("/api/internal/economy/daily", { cache: "no-store" }, { authRequired: true });
      if (response.ok) setEconomy((await response.json()) as EconomyReport);
    } catch {
      // The economy report is optional; the treasury panel keeps working without it.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportResponse, withdrawalsResponse] = await Promise.all([
        fetchWithSupabaseAuth("/api/internal/treasury", { cache: "no-store" }, { authRequired: true }),
        fetchWithSupabaseAuth("/api/internal/treasury/withdrawals", { cache: "no-store" }, { authRequired: true })
      ]);
      if (!reportResponse.ok || !withdrawalsResponse.ok) throw new Error(t("operator.loadFailed"));
      setReport((await reportResponse.json()) as TreasuryCoverageReport);
      setWithdrawals((await withdrawalsResponse.json()) as WithdrawalsPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("operator.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    void loadProposals(false);
    void loadEconomy();
  }, [load, loadProposals, loadEconomy]);

  const usd = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `$${value.toFixed(2)}`);
  const pct = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(2)}%`);
  const ratio = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toFixed(2));

  return (
    <Sheet bare titleId="operator-title" onClose={onClose} style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 id="operator-title">{t("operator.title")}</h2>
          <span style={{ display: "flex", gap: 6 }}>
            <button className="secondary-button" type="button" aria-label={t("operator.refresh")} onClick={() => void load()} disabled={loading}><RefreshCw size={16} /></button>
            <button className="secondary-button" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={16} /></button>
          </span>
        </header>

        {error ? <p className="challenge-error">{error}</p> : null}
        {loading && !report ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}

        {report ? (
          <section aria-label={t("operator.coverage")}>
            <h3>
              <span aria-hidden="true" style={{ display: "inline-block", width: 12, height: 12, borderRadius: 999, background: LIGHT_COLORS[report.light], marginInlineEnd: 8 }} />
              {t("operator.coverage")}: {t(`operator.light.${report.light}` as never)}
            </h3>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", margin: 0 }}>
              <dt>{t("operator.reserve")}</dt><dd>{usd(report.treasury.totalUsd)}</dd>
              <dt>TON</dt><dd>{report.treasury.tonBalance === null ? "—" : report.treasury.tonBalance.toFixed(3)} ({usd(report.treasury.tonUsd)})</dd>
              <dt>USDT</dt><dd>{report.treasury.usdtBalance === null ? "—" : report.treasury.usdtBalance.toFixed(2)} ({usd(report.treasury.usdtUsd)})</dd>
              <dt>{t("operator.volatileShare")}</dt><dd>{report.volatileShare === null ? "—" : `${Math.round(report.volatileShare * 100)}%`}</dd>
              <dt>{t("operator.liabilities")}</dt><dd>{usd(report.liabilities.total)}</dd>
              <dt>{t("operator.inFlight")}</dt><dd>{usd(report.liabilities.withdrawalsInFlight)}</dd>
              <dt>{t("operator.manualReview")}</dt><dd>{report.liabilities.manualReviewCount} ({usd(report.liabilities.manualReviewTotal)})</dd>
              <dt>{t("operator.ratio")}</dt><dd>{ratio(report.coverageRatio)}</dd>
              <dt>{t("operator.stressRatio")}</dt><dd>{ratio(report.stressCoverageRatio)}</dd>
              <dt>{t("operator.withdrawAvg", { days: report.withdrawalStats.days })}</dt><dd>{pct(report.withdrawalStats.averageShare)}</dd>
              <dt>{t("operator.withdrawMedian", { days: report.withdrawalStats.days })}</dt><dd>{pct(report.withdrawalStats.medianShare)}</dd>
              <dt>{t("operator.withdrawMax", { days: report.withdrawalStats.days })}</dt><dd>{pct(report.withdrawalStats.maxShare)}</dd>
            </dl>
            {report.treasury.errors.length ? <p className="challenge-error">{report.treasury.errors.join(", ")}</p> : null}
          </section>
        ) : null}

        {economy ? (
          <section aria-label={t("operator.economy.title")}>
            <h3>{t("operator.economy.title")}</h3>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "4px 12px", margin: 0 }}>
              <dt />
              <dd><strong>{t("operator.economy.day")}</strong></dd>
              <dd><strong>{t("operator.economy.week")}</strong></dd>
              <dt>{t("operator.economy.rewards")}</dt><dd>{usd(economy.day.rewardsTotal)}</dd><dd>{usd(economy.week.rewardsTotal)}</dd>
              <dt>{t("operator.economy.coreWallet")}</dt><dd>{usd(economy.day.rewardsCore)} / {usd(economy.day.rewardsWallet)}</dd><dd>{usd(economy.week.rewardsCore)} / {usd(economy.week.rewardsWallet)}</dd>
              <dt>{t("operator.economy.active")}</dt><dd>{economy.day.activeUsers}</dd><dd>{economy.week.activeUsers}</dd>
              <dt>{t("operator.economy.newUsers")}</dt><dd>{economy.day.newUsers}</dd><dd>{economy.week.newUsers}</dd>
              <dt>{t("operator.economy.newReferred")}</dt><dd>{economy.day.newReferred}</dd><dd>{economy.week.newReferred}</dd>
              <dt>{t("operator.economy.costPerReferred")}</dt><dd>{usd(economy.day.costPerReferred)}</dd><dd>{usd(economy.week.costPerReferred)}</dd>
              <dt>{t("operator.economy.perActive")}</dt><dd>{usd(economy.day.rewardPerActiveUser)}</dd><dd>{usd(economy.week.rewardPerActiveUser)}</dd>
              <dt>{t("operator.economy.earned1")}</dt><dd>{pct(economy.day.earnedAtLeast1)}</dd><dd>{pct(economy.week.earnedAtLeast1)}</dd>
              <dt>{t("operator.economy.earned10")}</dt><dd>{pct(economy.day.earnedAtLeast10)}</dd><dd>{pct(economy.week.earnedAtLeast10)}</dd>
            </dl>
            {economy.week.top.length ? <p className="transfer-muted">{t("operator.economy.top")}: {economy.week.top.map((item) => `${item.title} ×${item.count} (${usd(item.total)})`).join(", ")}</p> : null}
            <p className="transfer-muted">{t("operator.economy.sales", { count: economy.salesChecked, flagged: economy.suspiciousSales.length })}</p>
            {economy.suspiciousSales.length ? (
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {economy.suspiciousSales.slice(0, 8).map((flag) => (
                  <li key={`${flag.kind}-${flag.sellerId}-${flag.buyerId}`} className="transfer-muted">
                    {t(`operator.economy.flag.${flag.kind}` as never)} · {flag.sellerId.slice(0, 8)} → {flag.buyerId.slice(0, 8)} · ×{flag.deals} · {usd(flag.total)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {withdrawals?.limits ? (
          <section aria-label={t("operator.limits")}>
            <h3>{t("operator.limits")}</h3>
            <p className="transfer-muted">
              {t("operator.limitsLine", {
                perUser: withdrawals.limits.perUserDaily,
                global: withdrawals.limits.globalDaily,
                used: withdrawals.limits.usedLast24h.toFixed(2)
              })}
            </p>
          </section>
        ) : null}

        {withdrawals ? (
          <section aria-label={t("operator.withdrawals")}>
            <h3>{t("operator.withdrawals")}</h3>
            {withdrawals.withdrawals.length === 0 ? <p className="transfer-muted">{t("operator.noWithdrawals")}</p> : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {withdrawals.withdrawals.map((row) => (
                  <li key={`${row.asset}-${row.id}`} style={{ padding: "8px 10px", borderRadius: 10, background: ATTENTION_STATUSES.has(row.status) ? "rgba(217, 154, 0, 0.16)" : "rgba(0, 0, 0, 0.04)" }}>
                    <strong>{row.asset} {row.amount ?? ""}</strong> · ${Number(row.payoutWalletAmount ?? 0).toFixed(2)} · {row.status}
                    {row.errorCode ? ` · ${row.errorCode}` : ""}{row.errorMessage ? ` · ${row.errorMessage}` : ""}
                    <br />
                    <span className="transfer-muted">{new Date(row.createdAt).toLocaleString()} · {row.userId.slice(0, 8)}{row.transactionHash ? ` · ${row.transactionHash.slice(0, 10)}…` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-label={t("operator.coordinator")}>
          <h3 style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {t("operator.coordinator.queue")}
            <button className="secondary-button" type="button" disabled={proposalBusy} onClick={() => void loadProposals(true)}>{t("operator.coordinator.refresh")}</button>
          </h3>
          {proposals.length === 0 ? <p className="transfer-muted">{t("operator.coordinator.empty")}</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {proposals.map((item) => (
                <li key={item.id} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(0, 0, 0, 0.04)" }}>
                  <strong>{item.title}</strong>
                  <br />
                  <span className="transfer-muted">{item.rationale}</span>
                  {item.target_user_ids.length ? <><br /><span className="transfer-muted">{item.target_user_ids.join(", ")}</span></> : null}
                  <span style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="secondary-button" type="button" disabled={proposalBusy} onClick={() => void decide(item.id, "approved")}>{t("operator.coordinator.approve")}</button>
                    <button className="secondary-button" type="button" disabled={proposalBusy} onClick={() => void decide(item.id, "rejected")}>{t("operator.coordinator.reject")}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t("operator.market.title")}>
          <h3 style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {t("operator.market.title")}
            <button className="secondary-button" type="button" disabled={listingBusy} onClick={() => void loadListings()}>{t("operator.market.refresh")}</button>
          </h3>
          {listings === null ? null : listings.length === 0 ? <p className="transfer-muted">{t("operator.market.empty")}</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {listings.map((item) => (
                <li key={item.id} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(0, 0, 0, 0.04)" }}>
                  <strong>{item.title}</strong> · <span className="transfer-muted">{item.price}</span>
                  {item.description ? <><br /><span className="transfer-muted">{item.description}</span></> : null}
                  <br />
                  <span className="transfer-muted">{item.flags.map((flag) => t(`market.guestReview.flag.${flag}` as never)).join(", ")} · {item.sellerUserId}</span>
                  <span style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="secondary-button" type="button" disabled={listingBusy} onClick={() => void reviewListing(item.id, "approved")}>{t("operator.market.approve")}</button>
                    <button className="secondary-button" type="button" disabled={listingBusy} onClick={() => void reviewListing(item.id, "rejected")}>{t("operator.market.reject")}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t("operator.nudges.title")}>
          <h3 style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {t("operator.nudges.title")}
            <button className="secondary-button" type="button" disabled={nudgeBusy} onClick={() => void previewNudges()}>{t("operator.nudges.preview")}</button>
          </h3>
          {nudges === null ? null : nudges.length === 0 ? <p className="transfer-muted">{t("operator.nudges.none")}</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {nudges.map((item) => (
                <li key={item.user} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(0, 0, 0, 0.04)" }}>
                  <strong>{item.user}</strong> · <span className="transfer-muted">{t(`operator.nudges.step.${item.step}` as never)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
    </Sheet>
  );
}
