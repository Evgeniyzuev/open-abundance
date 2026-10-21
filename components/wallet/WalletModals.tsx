"use client";

import { personLabel } from "@/lib/personName";
import { useEffect, useState, useCallback } from "react";
import Sheet from "@/components/ui/Sheet";
import { QRCodeSVG } from "qrcode.react";
import { UserLevelBadge, UserNameWithLevel } from "@/components/UserLevelBadge";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import QrScanButton from "@/components/QrScanner";
import RecipientSearch from "@/components/RecipientSearch";
import { type CoreAccount } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney, formatRateMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { nanoToTonAmount, tonAmountToNano } from "@/lib/tonAmount";
import type { Tables } from "@/lib/database.types";
import { parseScanned } from "@/lib/qrPayload";
import { guestReview, isHiddenFromGuests, publicListingPath } from "@/lib/marketplaceGuestVisibility";
import { isUuid } from "@/lib/uuid";
import { startVisiblePolling } from "@/lib/visiblePolling";
import MarketOfferHelper from "@/components/MarketOfferHelper";
import type { TonDepositInvoice, TonDepositEvent, DepositQuote, TonWithdrawalQuote, TonWithdrawal, TFunction, WalletTransferContact, WalletRecipient, MarketplaceListing, MarketplaceListingInput, WalletTransferReceipt, WalletRow } from "@/components/wallet/walletTypes";
import { loadWalletTransferContacts, loadWalletRecipient, getAccessToken, contactName, contactInitial, shortId, shortHash, formatFixedUsd, formatAssetAmount, isTonDepositTerminal, isTonDepositReusable, tonDepositStatusKey, withdrawalStatusKey, parseNumber } from "@/components/wallet/walletHelpers";

export function MarketplaceListingDetailModal({
  listing,
  locale,
  t,
  own,
  onClose,
  onEdit
}: {
  listing: MarketplaceListing;
  locale: AppLocale;
  t: TFunction;
  own: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const kind = listing.listing_kind ?? "digital_asset";
  const kindLabel = kind === "physical_good" ? t("market.kind.physical") : t(`market.kind.${kind}` as MessageKey);
  return (
    <Sheet bare className="small" ariaLabel={t("market.details")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("market.details")}</h2>
          {own ? <button className="text-button" type="button" onClick={onEdit}>{t("market.edit")}</button> : <span />}
        </div>
        <div className="sell-modal-body">
          <strong>{listing.title}</strong>
          {listing.description ? <p>{listing.description}</p> : null}
          <p>{formatAdaptiveMoney(Number(listing.price_amount), locale)} · {kindLabel}</p>
          {listing.category ? <p>{t("market.category")}: {listing.category}</p> : null}
          {listing.fulfillment_days ? <p>{t("market.fulfillment")}: {listing.fulfillment_days} {locale === "ru" ? "дн." : "days"}</p> : null}
          <small>{t("market.termsVersion")}: {listing.terms_version ?? 1}</small>
          {listing.terms_hash ? <small>{t("market.termsHash")}: {listing.terms_hash.slice(0, 18)}…</small> : null}
        </div>
    </Sheet>
  );
}

export function MarketplaceEditModal({
  listing,
  locale,
  t,
  onClose,
  onSave
}: {
  listing: MarketplaceListing;
  locale: AppLocale;
  t: TFunction;
  onClose: () => void;
  onSave: (input: MarketplaceListingInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description ?? "");
  const [imageUrl, setImageUrl] = useState(listing.image_url ?? "");
  const [category, setCategory] = useState(listing.category ?? "");
  const [fulfillmentDays, setFulfillmentDays] = useState(String(listing.fulfillment_days ?? 7));
  const [price, setPrice] = useState(String(listing.price_amount));
  const [hideFromGuests, setHideFromGuests] = useState(isHiddenFromGuests(listing.metadata));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedPrice = parseNumber(price);
  const valid = title.trim().length > 0 && Number.isFinite(parsedPrice) && parsedPrice > 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        category,
        description,
        fulfillmentDays: Number(fulfillmentDays),
        hideFromGuests,
        imageUrl,
        listingKind: listing.listing_kind ?? "digital_asset",
        priceAmount: Math.round(parsedPrice * 100) / 100,
        title
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update listing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet bare className="small" ariaLabel={t("market.edit")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("market.edit")}</h2>
          <button className="text-button" type="button" disabled={!valid || saving} onClick={() => { void save(); }}>{saving ? t("app.common.loading") : t("market.save")}</button>
        </div>
        <div className="sell-modal-body">
          <label className="finance-field"><span>{t("market.item")}</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="finance-field"><span>{t("market.description")}</span><textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="finance-field"><span>{t("market.image")}</span><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
          <label className="finance-field"><span>{t("market.category")}</span><input value={category} maxLength={80} onChange={(event) => setCategory(event.target.value)} /></label>
          {listing.listing_kind !== "digital_asset" ? <label className="finance-field"><span>{t("market.fulfillment")}</span><select value={fulfillmentDays} onChange={(event) => setFulfillmentDays(event.target.value)}><option value="1">1</option><option value="3">3</option><option value="7">7</option><option value="14">14</option></select></label> : null}
          <label className="finance-field"><span>{t("market.price")}</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          <GuestVisibilityToggle checked={hideFromGuests} onChange={setHideFromGuests} t={t} />
          <GuestReviewNotice metadata={listing.metadata} t={t} />
          {!hideFromGuests && listing.status === "active" && !["pending", "rejected"].includes(guestReview(listing.metadata)?.status ?? "") ? <small>{t("market.publicPage")}: <a href={publicListingPath(listing.id)} target="_blank" rel="noreferrer">{publicListingPath(listing.id)}</a></small> : null}
          {error ? <p className="finance-error">{error}</p> : null}
          <small>{t("market.termsVersion")}: {(listing.terms_version ?? 1) + 1}</small>
        </div>
    </Sheet>
  );
}

function GuestReviewNotice({ metadata, t }: { metadata: unknown; t: TFunction }) {
  const review = guestReview(metadata);
  if (!review || review.status === "approved") return null;
  const reasons = review.flags.map((flag) => t(`market.guestReview.flag.${flag}` as never)).join(", ");
  return <small className="finance-error">{t(review.status === "pending" ? "market.guestReview.pending" : "market.guestReview.rejected")}{reasons ? ` (${reasons})` : ""}</small>;
}

function GuestVisibilityToggle({ checked, onChange, t }: { checked: boolean; onChange: (value: boolean) => void; t: TFunction }) {
  return (
    <div className="finance-field">
      <label className="routine-shopping-toggle">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{t("market.hideFromGuests")}</span>
      </label>
      <small>{t("market.hideFromGuestsHint")}</small>
    </div>
  );
}

export function SellItemModal({
  listingLimit,
  locale,
  openListingCount,
  t,
  onClose,
  onCreate
}: {
  listingLimit: number;
  locale: AppLocale;
  openListingCount: number;
  t: TFunction;
  onClose: () => void;
  onCreate: (input: MarketplaceListingInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [artifactType, setArtifactType] = useState("market_item");
  const [listingKind, setListingKind] = useState<"digital_asset" | "service" | "physical_good">("digital_asset");
  const [category, setCategory] = useState("");
  const [fulfillmentDays, setFulfillmentDays] = useState("7");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [hideFromGuests, setHideFromGuests] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedPrice = parseNumber(price);
  const limitReached = openListingCount >= listingLimit;
  const valid = title.trim().length > 0 && Number.isFinite(parsedPrice) && parsedPrice > 0 && !limitReached;

  function applyOfferDraft(draft: { title: string; description: string; listingKind: "digital_asset" | "service" | "physical_good"; fulfillmentDays: number }) {
    setTitle(draft.title);
    setDescription(draft.description);
    setListingKind(draft.listingKind);
    setArtifactType(draft.listingKind === "service" ? "service" : "market_item");
    setFulfillmentDays(String(draft.fulfillmentDays));
    setError(null);
  }

  async function handleCreate() {
    if (!valid) return;

    setSaving(true);
    setError(null);
    try {
      await onCreate({
        artifactType,
        listingKind,
        category,
        fulfillmentDays: Number(fulfillmentDays),
        description,
        hideFromGuests,
        imageUrl,
        priceAmount: Math.round(parsedPrice * 100) / 100,
        title
      });
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create listing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet bare className="small" ariaLabel={t("market.sell")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("market.sell")}</h2>
          <span />
        </div>
        <div className="sell-modal-body">
          {!limitReached ? (
            <>
              <MarketOfferHelper onApply={applyOfferDraft} />
              <label className="finance-field">
                <span>{t("market.item")}</span>
                <input
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError(null);
                  }}
                  placeholder={t("market.titlePlaceholder")}
                  autoFocus
                />
              </label>
              <label className="finance-field">
                <span>{t("market.image")} <MediaUrlHelp t={t} /></span>
                <input
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label className="finance-field">
                <span>{t("market.type")}</span>
                <select value={artifactType} onChange={(event) => setArtifactType(event.target.value)}>
                  <option value="market_item">{t("market.type.item")}</option>
                  <option value="service">{t("market.type.service")}</option>
                  <option value="skill">{t("market.type.skill")}</option>
                </select>
              </label>
              <label className="finance-field">
                <span>{t("market.kind")}</span>
                <select value={listingKind} onChange={(event) => setListingKind(event.target.value as typeof listingKind)}>
                  <option value="digital_asset">{t("market.kind.digital")}</option>
                  <option value="service">{t("market.kind.service")}</option>
                  <option value="physical_good">{t("market.kind.physical")}</option>
                </select>
              </label>
              <label className="finance-field">
                <span>{t("market.category")}</span>
                <input value={category} maxLength={80} onChange={(event) => setCategory(event.target.value)} />
              </label>
              {listingKind !== "digital_asset" ? (
                <label className="finance-field">
                  <span>{t("market.fulfillment")}</span>
                  <select value={fulfillmentDays} onChange={(event) => setFulfillmentDays(event.target.value)}>
                    <option value="1">1</option>
                    <option value="3">3</option>
                    <option value="7">7</option>
                    <option value="14">14</option>
                  </select>
                </label>
              ) : null}
              <label className="topup-field">
                <span>{t("market.price")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => {
                    setPrice(event.target.value);
                    setError(null);
                  }}
                  placeholder={formatAdaptiveMoney(1, locale)}
                />
              </label>
              <label className="finance-field">
                <span>{t("market.terms")}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1000}
                  placeholder={t("market.termsPlaceholder")}
                />
              </label>
              <GuestVisibilityToggle checked={hideFromGuests} onChange={setHideFromGuests} t={t} />
              {error ? <p className="topup-error">{error}</p> : null}
              <div className="topup-modal-actions">
                <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
                <button className="challenge-primary-action" type="button" disabled={!valid || saving} onClick={handleCreate}>
                  {saving ? t("app.common.loading") : t("market.create")}
                </button>
              </div>
            </>
          ) : (
            <FinanceState title={t("market.noSellableTitle")} description={t("market.limitReached")} />
          )}
        </div>
    </Sheet>
  );
}

export function TonWithdrawalModal({
  locale,
  t,
  wallet,
  onClose,
  onSuccess
}: {
  locale: AppLocale;
  t: TFunction;
  wallet: WalletRow;
  onClose: () => void;
  onSuccess: (newWallet: WalletRow) => Promise<void>;
}) {
  const [quote, setQuote] = useState<TonWithdrawalQuote | null>(null);
  const [amountTon, setAmountTon] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [withdrawal, setWithdrawal] = useState<TonWithdrawal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadQuote() {
      setLoading(true);
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/withdrawals/ton?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
        });
        const payload = (await response.json()) as {
          enabled?: boolean;
          quote?: TonWithdrawalQuote;
          error?: string;
          reason?: "disabled" | "mnemonic_missing" | "mnemonic_invalid" | "ready";
          diagnostics?: { mnemonicWordCount?: number };
        };
        if (!response.ok || payload.error) throw new Error(payload.error ?? t("wallet.withdraw.error.quote"));
        if (!payload.enabled || !payload.quote) {
          const unavailableMessage = payload.reason === "disabled"
            ? t("wallet.withdraw.unavailable.disabled")
            : payload.reason === "mnemonic_missing"
              ? t("wallet.withdraw.unavailable.mnemonicMissing")
              : payload.reason === "mnemonic_invalid"
                ? t("wallet.withdraw.unavailable.mnemonicInvalid", { count: payload.diagnostics?.mnemonicWordCount ?? 0 })
                : t("wallet.withdraw.unavailable");
          throw new Error(unavailableMessage);
        }
        if (mounted) setQuote(payload.quote);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : t("wallet.withdraw.error.quote"));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadQuote();
    return () => { mounted = false; };
  }, [t]);

  const normalizedAmount = amountTon.trim();
  const amountNano = normalizedAmount ? tonAmountToNano(normalizedAmount) : null;
  const amountValue = amountNano ? Number(nanoToTonAmount(amountNano) ?? "0") : 0;
  const amountValid = Boolean(quote && amountNano && amountValue >= Number(quote.minAmountTon) && amountValue <= Number(quote.maxAmountTon));
  const destinationValid = destinationAddress.trim().length >= 20;
  const payoutUsd = quote && amountValid ? amountValue * Number(quote.usdRate) : 0;
  const serviceFeeUsd = quote && amountValid ? payoutUsd * Number(quote.serviceFeePercent) / 100 : 0;
  const networkFeeUsd = quote && amountValid ? Number(quote.networkFeeReserveTon) * Number(quote.usdRate) : 0;
  const totalDebitUsd = payoutUsd + serviceFeeUsd + networkFeeUsd;
  const balanceValid = totalDebitUsd > 0 && totalDebitUsd <= wallet.balance;
  const withdrawalId = withdrawal?.id;
  const withdrawalStatus = withdrawal?.status;

  useEffect(() => {
    if (!withdrawalId || !withdrawalStatus || !["funds_reserved", "broadcasting"].includes(withdrawalStatus)) return;
    let mounted = true;
    async function refreshWithdrawal() {
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/withdrawals/ton/${withdrawalId}?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
        });
        const payload = (await response.json()) as { withdrawal?: TonWithdrawal; error?: string };
        if (mounted && response.ok && payload.withdrawal) setWithdrawal(payload.withdrawal);
      } catch {
        // Keep the last status and retry on the next interval.
      }
    }
    const stop = startVisiblePolling(() => { void refreshWithdrawal(); }, 15_000);
    return () => { mounted = false; stop(); };
  }, [withdrawalId, withdrawalStatus]);

  async function createWithdrawal() {
    if (!amountValid) {
      setError(t("wallet.withdraw.error.amount"));
      return;
    }
    if (!destinationValid) {
      setError(t("wallet.withdraw.error.address"));
      return;
    }
    if (!balanceValid) {
      setError(t("wallet.withdraw.error.insufficient"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/wallet/withdrawals/ton", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountTon: normalizedAmount.replace(",", "."),
          destinationAddress: destinationAddress.trim(),
          idempotencyKey: crypto.randomUUID()
        })
      });
      const payload = (await response.json()) as { withdrawal?: TonWithdrawal; wallet?: WalletRow; error?: string };
      if (!response.ok || payload.error || !payload.withdrawal) {
        throw new Error(payload.error ?? t("wallet.withdraw.error.create"));
      }
      setWithdrawal(payload.withdrawal);
      if (payload.wallet) await onSuccess(payload.wallet);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("wallet.withdraw.error.create"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet bare className="small" ariaLabel={t("wallet.withdraw.title")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.withdraw.title")}</h2>
          <span />
        </div>

        {loading ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
        {error ? <p className="topup-error">{error}</p> : null}
        {!loading && !withdrawal && quote ? (
          <div className="ton-withdraw-body">
            <div className="topup-balance-info">
              <div className="topup-balance-card">
                <span>{t("wallet.availableBalance")}</span>
                <strong className="wallet-color">{formatAdaptiveMoney(wallet.balance, locale)}</strong>
              </div>
              <div className="topup-balance-card">
                <span>{t("wallet.withdraw.rate")}</span>
                <strong>{formatFixedUsd(quote.usdRate, locale)} / TON</strong>
              </div>
            </div>
            <label className="finance-field">
              <span>{t("wallet.withdraw.amount")}</span>
              <input
                inputMode="decimal"
                value={amountTon}
                onChange={(event) => { setAmountTon(event.target.value); setError(null); }}
                placeholder={t("wallet.withdraw.amountPlaceholder")}
              />
            </label>
            {normalizedAmount && (!amountNano || !amountValid) ? <p className="topup-error">{t("wallet.withdraw.error.amountRange", { min: quote.minAmountTon, max: quote.maxAmountTon })}</p> : null}
            <label className="finance-field">
              <span>{t("wallet.withdraw.address")}</span>
              <div className="input-with-scan">
                <input
                  type="text"
                  value={destinationAddress}
                  onChange={(event) => { setDestinationAddress(event.target.value); setError(null); }}
                  placeholder={t("wallet.withdraw.addressPlaceholder")}
                  autoComplete="off"
                />
                <QrScanButton onScan={(text) => {
                  const scanned = parseScanned(text);
                  if (scanned.kind === "ton") { setDestinationAddress(scanned.address); setError(null); } else setError(t("scan.wrongAddress"));
                }} />
              </div>
            </label>
            <div className="ton-withdraw-fees">
              <div><span>{t("wallet.withdraw.payout")}</span><strong>{amountValid ? `${amountValue} TON · ` : ""}{formatFixedUsd(String(payoutUsd), locale)}</strong></div>
              <div><span>{t("wallet.withdraw.serviceFee", { percent: quote.serviceFeePercent })}</span><strong>{formatFixedUsd(String(serviceFeeUsd), locale)}</strong></div>
              <div><span>{t("wallet.withdraw.networkFee")}</span><strong>{formatFixedUsd(String(networkFeeUsd), locale)}</strong></div>
              <div className="ton-withdraw-total"><span>{t("wallet.withdraw.total")}</span><strong>{formatFixedUsd(String(totalDebitUsd), locale)}</strong></div>
            </div>
            <p className="transfer-muted">{t("wallet.withdraw.testNotice", { network: quote.network })}</p>
            {destinationAddress.trim() && !destinationValid ? <p className="topup-error">{t("wallet.withdraw.error.address")}</p> : null}
            {amountValid && !balanceValid ? <p className="topup-error">{t("wallet.withdraw.error.insufficient")}</p> : null}
            <div className="topup-modal-actions">
              <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
              <button className="challenge-primary-action" type="button" disabled={!amountValid || !destinationValid || !balanceValid || saving} onClick={() => void createWithdrawal()}>
                {saving ? t("app.common.loading") : t("wallet.withdraw.confirm")}
              </button>
            </div>
          </div>
        ) : null}
        {withdrawal ? (
          <div className="ton-withdraw-body">
            <div className="ton-deposit-status">
              <span>{t("wallet.withdraw.statusLabel")}</span>
              <strong>{t(withdrawalStatusKey(withdrawal.status))}</strong>
            </div>
            <div className="ton-deposit-field"><span>{t("wallet.withdraw.amount")}</span><strong>{withdrawal.amount_ton ?? "—"} TON</strong></div>
            <div className="ton-deposit-field"><span>{t("wallet.withdraw.address")}</span><code>{withdrawal.destination_address}</code></div>
            <div className="ton-withdraw-fees">
              <div><span>{t("wallet.withdraw.payout")}</span><strong>{formatFixedUsd(withdrawal.payout_wallet_amount ?? "0", locale)}</strong></div>
              <div><span>{t("wallet.withdraw.serviceFee", { percent: withdrawal.service_fee_percent ?? "1" })}</span><strong>{formatFixedUsd(withdrawal.service_fee_amount ?? "0", locale)}</strong></div>
              <div><span>{t("wallet.withdraw.networkFee")}</span><strong>{formatFixedUsd(withdrawal.network_fee_reserve_amount ?? "0", locale)}</strong></div>
              <div className="ton-withdraw-total"><span>{t("wallet.withdraw.total")}</span><strong>{formatFixedUsd(withdrawal.total_reserved_amount ?? "0", locale)}</strong></div>
            </div>
            {withdrawal.message_hash ? <p className="transfer-muted">{t("wallet.withdraw.messageHash", { hash: withdrawal.message_hash })}</p> : null}
            {withdrawal.error_message ? <p className="topup-error">{withdrawal.error_message}</p> : null}
            <button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.done")}</button>
          </div>
        ) : null}
    </Sheet>
  );
}

export function TonDepositModal({
  locale,
  t,
  wallet,
  onClose,
  onRefresh
}: {
  locale: AppLocale;
  t: TFunction;
  wallet: WalletRow | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [invoice, setInvoice] = useState<TonDepositInvoice | null>(null);
  const [chainEvent, setChainEvent] = useState<TonDepositEvent | null>(null);
  const [quotes, setQuotes] = useState<DepositQuote[]>([]);
  const [amount, setAmount] = useState("");
  const [replaceActive, setReplaceActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const tonQuote = quotes.find((quote) => quote.assetCode === "TON") ?? null;

  const normalizedAmount = amount.trim();
  const expectedAmountNano = normalizedAmount ? tonAmountToNano(normalizedAmount) : null;
  const amountValid = !normalizedAmount || Boolean(expectedAmountNano);
  const invoiceId = invoice?.id;
  const invoiceStatus = invoice?.status;

  const applyDepositPayload = useCallback((payload: {
    invoice?: TonDepositInvoice | null;
    event?: TonDepositEvent | null;
  }) => {
    setInvoice(payload.invoice ?? null);
    setChainEvent(payload.event ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadActiveInvoice() {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/deposits/ton?active=true&ts=${Date.now()}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache"
          }
        });
        const payload = (await response.json()) as {
          invoice?: TonDepositInvoice | null;
          event?: TonDepositEvent | null;
          error?: string;
        };
        if (!response.ok || payload.error) throw new Error(payload.error ?? t("wallet.deposit.error.load"));
        if (mounted) applyDepositPayload(payload);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : t("wallet.deposit.error.load"));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadActiveInvoice();
    return () => {
      mounted = false;
    };
  }, [applyDepositPayload, t]);

  useEffect(() => {
    let mounted = true;

    async function refreshQuotes() {
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/deposits/quotes?ts=${Date.now()}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache"
          }
        });
        const payload = (await response.json()) as { quotes?: DepositQuote[]; error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? t("wallet.deposit.error.quotes"));
        if (mounted) setQuotes(payload.quotes ?? []);
      } catch {
        if (mounted) setQuotes([]);
      } finally {
        if (mounted) setQuoteLoading(false);
      }
    }

    void refreshQuotes();
    const stop = startVisiblePolling(() => { void refreshQuotes(); }, 30_000);
    return () => {
      mounted = false;
      stop();
    };
  }, [t]);

  useEffect(() => {
    if (
      !invoiceId
      || !invoiceStatus
      || !["ready", "detected", "finalizing", "confirmed_pending_credit", "awaiting_rate"].includes(invoiceStatus)
    ) return;

    let mounted = true;
    async function refreshInvoice() {
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/deposits/ton/${invoiceId}?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
        });
        const payload = (await response.json()) as {
          invoice?: TonDepositInvoice;
          event?: TonDepositEvent | null;
          error?: string;
        };
        if (!response.ok || payload.error || !payload.invoice || !mounted) return;
        applyDepositPayload(payload);
        if (isTonDepositTerminal(payload.invoice.status)) void onRefresh();
      } catch {
        // The modal keeps the last known state and retries on the next interval.
      }
    }

    const stop = startVisiblePolling(() => { void refreshInvoice(); }, 15_000);
    return () => {
      mounted = false;
      stop();
    };
  }, [applyDepositPayload, invoiceId, invoiceStatus, onRefresh]);

  async function createInvoice() {
    if (!amountValid) {
      setError(t("wallet.deposit.error.amount"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/wallet/deposits/ton", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          expectedAmountNano,
          replaceActive
        })
      });
      const payload = (await response.json()) as {
        invoice?: TonDepositInvoice;
        event?: TonDepositEvent | null;
        error?: string;
      };
      if (!response.ok || payload.error || !payload.invoice) {
        throw new Error(payload.error ?? t("wallet.deposit.error.create"));
      }
      applyDepositPayload(payload);
      setReplaceActive(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("wallet.deposit.error.create"));
    } finally {
      setSaving(false);
    }
  }

  function replaceInvoice() {
    setAmount(nanoToTonAmount(invoice?.expected_amount_nano) ?? "");
    setReplaceActive(true);
    setInvoice(null);
    setChainEvent(null);
    setError(null);
  }

  function prepareNewInvoice() {
    setAmount("");
    setReplaceActive(Boolean(invoice && isTonDepositReusable(invoice.status)));
    setInvoice(null);
    setChainEvent(null);
    setError(null);
  }

  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1600);
    } catch {
      setError(t("wallet.deposit.error.copy"));
    }
  }

  return (
    <Sheet bare className="small" ariaLabel={t("wallet.deposit.title")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.deposit.title")}</h2>
          <span />
        </div>

        {loading ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
        {error ? <p className="topup-error">{error}</p> : null}
        {!loading && !invoice ? (
          <div className="ton-deposit-form">
            <div className="ton-deposit-asset-grid">
              <DepositAssetCard
                active
                assetCode="TON"
                title="Toncoin"
                quote={tonQuote}
                quoteLoading={quoteLoading}
                walletBalance={wallet?.balance ?? 0}
                locale={locale}
                t={t}
              />
            </div>

            <label className="finance-field">
              <span>{t("wallet.deposit.amount")}</span>
              <input
                inputMode="decimal"
                placeholder={t("wallet.deposit.amountPlaceholder")}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(null);
                }}
              />
            </label>

            {normalizedAmount && !amountValid ? (
              <p className="topup-error">{t("wallet.deposit.error.amount")}</p>
            ) : null}

            {normalizedAmount && amountValid && tonQuote?.usdRate ? (
              <p className="ton-deposit-estimate">
                {t("wallet.deposit.estimatedUsd", {
                  amount: formatFixedUsd(
                    String(Number(normalizedAmount.replace(",", ".")) * Number(tonQuote.usdRate)),
                    locale
                  )
                })}
              </p>
            ) : null}

            {replaceActive ? <p className="transfer-muted">{t("wallet.deposit.replaceNotice")}</p> : null}

            <div className="topup-modal-actions">
              <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
              <button
                className="challenge-primary-action"
                type="button"
                disabled={!amountValid || saving || !tonQuote?.depositEnabled}
                onClick={() => void createInvoice()}
              >
                {saving ? t("app.common.loading") : t("wallet.deposit.createInvoice")}
              </button>
            </div>
          </div>
        ) : null}
        {invoice ? (
          <div className="ton-deposit-body">
            <div className="ton-deposit-qr">
              <QRCodeSVG value={invoice.transferLink} size={184} includeMargin />
            </div>
            <p className="transfer-summary">{t("wallet.deposit.instructions")}</p>
            <div className="ton-deposit-field">
              <span>{t("wallet.deposit.network")}</span>
              <strong>{invoice.asset_code} · {invoice.network}</strong>
            </div>
            <div className="ton-deposit-field">
              <span>{t("wallet.deposit.address")}</span>
              <code>{invoice.deposit_address}</code>
              <button className="text-button" type="button" onClick={() => void copyValue(invoice.deposit_address, "address")}>
                {copied === "address" ? t("wallet.deposit.copied") : t("wallet.deposit.copy")}
              </button>
            </div>
            <div className="ton-deposit-field">
              <span>{t("wallet.deposit.comment")}</span>
              <code>{invoice.comment}</code>
              <button className="text-button" type="button" onClick={() => void copyValue(invoice.comment, "comment")}>
                {copied === "comment" ? t("wallet.deposit.copied") : t("wallet.deposit.copy")}
              </button>
            </div>
            {invoice.expected_amount_nano ? (
              <div className="ton-deposit-field">
                <span>{t("wallet.deposit.expectedAmount")}</span>
                <strong>{nanoToTonAmount(invoice.expected_amount_nano)} TON</strong>
              </div>
            ) : null}
            <div className="ton-deposit-status">
              <span>{t("wallet.deposit.statusLabel")}</span>
              <strong>{t(tonDepositStatusKey(invoice.status))}</strong>
            </div>

            <p className="transfer-muted">{t("wallet.deposit.averageCreditTime")}</p>

            <TonDepositResult chainEvent={chainEvent} invoice={invoice} locale={locale} t={t} />

            {["credited", "credited_late", "credited_amount_mismatch", "rejected", "cancelled", "expired"].includes(invoice.status) ? (
              <button className="challenge-primary-action" type="button" onClick={prepareNewInvoice}>
                {t("wallet.deposit.newInvoice")}
              </button>
            ) : null}

            {invoice.status === "ready" ? (
              <button className="text-button" type="button" onClick={replaceInvoice}>
                {t("wallet.deposit.replace")}
              </button>
            ) : null}
          </div>
        ) : null}
    </Sheet>
  );
}

export function TonDepositResult({
  chainEvent,
  invoice,
  locale,
  t
}: {
  chainEvent: TonDepositEvent | null;
  invoice: TonDepositInvoice;
  locale: AppLocale;
  t: TFunction;
}) {
  let title = t(tonDepositStatusKey(invoice.status));
  let description = "";

  if (["credited", "credited_late", "credited_amount_mismatch"].includes(invoice.status)) {
    const creditedAmount = chainEvent?.settled_usd_amount
      ? formatFixedUsd(chainEvent.settled_usd_amount, locale)
      : null;
    title = creditedAmount
      ? t("wallet.deposit.result.creditedAmount", { amount: creditedAmount })
      : t("wallet.deposit.result.credited");
    if (chainEvent) {
      const details = [`${nanoToTonAmount(chainEvent.amount_nano) ?? "0"} TON`];
      if (chainEvent.ton_usd_rate) {
        details.push(`× ${formatRateMoney(Number(chainEvent.ton_usd_rate), locale)}`);
      }
      if (chainEvent.transaction_hash) details.push(shortHash(chainEvent.transaction_hash));
      description = details.join(" · ");
    }
  } else if (invoice.status === "rejected") {
    description = chainEvent?.rejection_reason === "bounced"
      ? t("wallet.deposit.result.rejectedBounced")
      : t("wallet.deposit.result.rejectedAborted");
  } else {
    return null;
  }

  return (
    <div className={`ton-deposit-check-result status-${invoice.status}`}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function DepositAssetCard({
  active = false,
  assetCode,
  title,
  quote,
  quoteLoading,
  walletBalance,
  locale,
  t
}: {
  active?: boolean;
  assetCode: "TON" | "USDT";
  title: string;
  quote: DepositQuote | null;
  quoteLoading: boolean;
  walletBalance: number;
  locale: AppLocale;
  t: TFunction;
}) {
  const rate = quote?.usdRate ? Number(quote.usdRate) : null;
  const walletEquivalent = rate && rate > 0 ? walletBalance / rate : null;

  return (
    <article className={`ton-deposit-asset-card${active ? " active" : ""}${quote?.depositEnabled === false ? " disabled" : ""}`}>
      <div>
        <strong>{assetCode}</strong>
        <span>{title}</span>
      </div>
      <p>
        {quoteLoading
          ? t("app.common.loading")
          : rate
            ? t("wallet.deposit.rate", { asset: assetCode, rate: formatRateMoney(rate, locale) })
            : t("wallet.deposit.rateUnavailable")}
      </p>
      <small>
        {walletEquivalent === null
          ? t("wallet.deposit.walletEquivalentUnavailable")
          : t("wallet.deposit.walletEquivalent", {
              amount: formatAssetAmount(walletEquivalent, locale),
              asset: assetCode
            })}
      </small>
      {assetCode === "USDT" && quote?.depositEnabled === false ? <em>{t("wallet.deposit.usdtSoon")}</em> : null}
    </article>
  );
}

export function WalletTransferModal({
  locale,
  t,
  wallet,
  initialRecipient,
  onClose,
  onSuccess
}: {
  locale: AppLocale;
  t: TFunction;
  wallet: WalletRow;
  initialRecipient?: WalletRecipient | null;
  onClose: () => void;
  onSuccess: (newWallet: Tables<"wallet_accounts">) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [contacts, setContacts] = useState<WalletTransferContact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [recipientUserId, setRecipientUserId] = useState(initialRecipient?.user_id ?? "");
  const [recipientPreview, setRecipientPreview] = useState<WalletRecipient | null>(initialRecipient ?? null);
  const [recipientResolving, setRecipientResolving] = useState(false);
  const [transferKey, setTransferKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WalletTransferReceipt | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadContacts() {
      setContactsError(null);
      try {
        const rows = await loadWalletTransferContacts();
        if (!mounted) return;
        setContacts(rows);
        if (rows[0]?.contact_user_id && !initialRecipient) {
          setRecipientUserId(rows[0].contact_user_id);
          setRecipientPreview(rows[0].profile);
        }
      } catch (loadError) {
        console.warn("Wallet transfer contacts load failed", loadError);
        if (mounted) {
          setContacts([]);
          setContactsError(loadError instanceof Error ? loadError.message : "Failed to load contacts.");
        }
      }
    }

    loadContacts();
    return () => {
      mounted = false;
    };
    // The initial recipient only matters when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsedAmount = parseNumber(amount);
  const validRecipient = isUuid(recipientUserId.trim());
  const selectedContact = (contacts ?? []).find((contact) => contact.contact_user_id === recipientUserId);
  const recipientResolved = Boolean(selectedContact?.profile || recipientPreview?.user_id === recipientUserId.trim());
  const isValid = validRecipient && recipientResolved && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= wallet.balance;

  async function resolveRecipient() {
    const value = recipientUserId.trim();
    if (!isUuid(value) || selectedContact?.profile) return;
    setRecipientResolving(true);
    setError(null);
    try {
      const recipient = await loadWalletRecipient(value);
      setRecipientPreview(recipient);
    } catch (resolveError) {
      setRecipientPreview(null);
      setError(resolveError instanceof Error ? resolveError.message : "Recipient profile not found.");
    } finally {
      setRecipientResolving(false);
    }
  }

  // A scanned code selects the person: a nickname or profile link, or a payment-request link.
  async function applyScannedRecipient(text: string) {
    const scanned = parseScanned(text);
    setError(null);
    try {
      if (scanned.kind === "nick") {
        const response = await fetchWithSupabaseAuth(`/api/wallet/recipients/search?q=${encodeURIComponent(scanned.nickname)}`, { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json()) as { people?: WalletRecipient[] };
        const person = payload.people?.find((item) => item.username === scanned.nickname);
        if (!person) { setError(t("scan.noPerson")); return; }
        setRecipientUserId(person.user_id);
        setRecipientPreview(person);
      } else if (scanned.kind === "user") {
        const person = await loadWalletRecipient(scanned.userId);
        setRecipientUserId(person.user_id);
        setRecipientPreview(person);
      } else if (scanned.kind === "pay") {
        window.location.assign(`/?pay=${scanned.requestId}`);
      } else if (scanned.kind === "ton") {
        setError(t("scan.tonForTransfer"));
      } else {
        setError(t("scan.unknown"));
      }
    } catch {
      setError(t("scan.noPerson"));
    }
  }

  async function handleConfirm() {
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const stableTransferKey = transferKey ?? crypto.randomUUID();
      if (!transferKey) setTransferKey(stableTransferKey);
      const response = await fetch("/api/wallet/transfer", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parsedAmount,
          idempotencyKey: stableTransferKey,
          recipientUserId: recipientUserId.trim()
        })
      });
      const payload = (await response.json()) as { wallet?: Tables<"wallet_accounts">; transfer?: WalletTransferReceipt; error?: string };

      if (!response.ok || payload.error || !payload.wallet || !payload.transfer) {
        throw new Error(payload.error ?? "Failed to transfer Wallet.");
      }

      await onSuccess(payload.wallet);
      setReceipt(payload.transfer);
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Failed to transfer Wallet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet bare className="small" ariaLabel={t("wallet.transfer.title")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.transfer.title")}</h2>
          <span />
        </div>
          <div className="transfer-modal-body">
          {receipt ? (
            <div className="transfer-receipt">
              <strong>{t("wallet.transfer.receipt")}</strong>
              <span>{formatAdaptiveMoney(receipt.amount, locale)} · {personLabel(recipientPreview, shortId(recipientUserId))}</span>
              <small>{t("wallet.transfer.receiptSource")}: {receipt.sourceId}</small>
              <small>{t("wallet.transfer.receiptBalance", { balance: formatAdaptiveMoney(receipt.sender.balanceAfter ?? 0, locale) })}</small>
              <button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.close")}</button>
            </div>
          ) : null}
          <div className="topup-balance-info">
            <div className="topup-balance-card">
              <span>{t("wallet.availableBalance")}</span>
              <strong className="wallet-color">{formatAdaptiveMoney(wallet.balance, locale)}</strong>
            </div>
          </div>

          <div className="transfer-contact-block">
            <span className="transfer-field-label">{t("wallet.transfer.recipient")}</span>
            {contacts === null ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
            {contactsError ? <p className="topup-error">{contactsError}</p> : null}
            {(contacts ?? []).length > 0 ? (
              <div className="transfer-contact-list">
                {(contacts ?? []).slice(0, 6).map((contact) => (
                  <button
                    className={contact.contact_user_id === recipientUserId ? "transfer-contact selected" : "transfer-contact"}
                    key={contact.contact_user_id}
                    type="button"
                    onClick={() => {
                      setRecipientUserId(contact.contact_user_id);
                      setRecipientPreview(contact.profile);
                      setError(null);
                    }}
                  >
                    <span className="transfer-avatar">{contactInitial(contact)}</span>
                    <span>
                      <strong>
                        <UserNameWithLevel
                          label={contact.profile ? t("profile.levelBadge", { level: contact.profile.level }) : undefined}
                          level={contact.profile?.level}
                        >
                          {contactName(contact)}
                        </UserNameWithLevel>
                      </strong>
                      <small>{shortId(contact.contact_user_id)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <RecipientSearch
              t={t}
              onSelect={(person) => {
                setRecipientUserId(person.user_id);
                setRecipientPreview(person as unknown as WalletRecipient);
                setError(null);
              }}
              trailing={<QrScanButton onScan={(text) => void applyScannedRecipient(text)} />}
            />
          </div>

          <div className="topup-field">
            <span>{t("wallet.transfer.amount")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              placeholder="0"
              autoFocus
            />
          </div>

          {recipientPreview ? (
            <p className="transfer-summary">
              {t("wallet.transfer.summary", { amount: formatAdaptiveMoney(parsedAmount, locale), recipient: personLabel(recipientPreview, shortId(recipientPreview.user_id)) })}
              {recipientPreview ? (
                <>
                  {" "}
                  <UserLevelBadge
                    label={t("profile.levelBadge", { level: recipientPreview.level })}
                    level={recipientPreview.level}
                  />
                </>
              ) : null}
            </p>
          ) : null}
          {!validRecipient && recipientUserId.trim() ? <p className="topup-error">{t("wallet.transfer.error.recipient")}</p> : null}
          {validRecipient && !recipientResolved && !recipientResolving ? <p className="topup-error">{t("wallet.transfer.error.resolveRecipient")}</p> : null}
          {recipientResolving ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
          {error ? <p className="topup-error">{error}</p> : null}
          <div className="topup-modal-actions">
            <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
            <button className="challenge-primary-action" type="button" disabled={!isValid || saving} onClick={handleConfirm}>
              {saving ? t("app.common.loading") : t("wallet.transfer.confirm")}
            </button>
          </div>
        </div>
    </Sheet>
  );
}

export function TopupCoreModal({
  core,
  wallet,
  locale,
  t,
  onClose,
  onSuccess
}: {
  core: CoreAccount;
  wallet: WalletRow;
  locale: AppLocale;
  t: TFunction;
  onClose: () => void;
  onSuccess: (newCore: Tables<"core_accounts">, newWallet: Tables<"wallet_accounts">) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseNumber(amount);
  const isValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= wallet.balance;

  async function handleConfirm() {
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/core/topup", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: parsedAmount })
      });
      const payload = await response.json();

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to top up core.");
      }

      await onSuccess(payload.core, payload.wallet);
      onClose();
    } catch (topupError) {
      setError(topupError instanceof Error ? topupError.message : "Failed to top up core.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet bare className="small" ariaLabel={t("wallet.topup.title")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.topup.title")}</h2>
          <span />
        </div>
        <div className="topup-modal-body">
          <div className="topup-balance-info">
            <div className="topup-balance-card">
              <span>{t("wallet.availableBalance")}</span>
              <strong className="wallet-color">{formatAdaptiveMoney(wallet.balance, locale)}</strong>
            </div>
            <div className="topup-balance-card">
              <span>{t("wallet.core")}</span>
              <strong className="core-color">{formatAdaptiveMoney(core.balance, locale)}</strong>
            </div>
          </div>
          <div className="topup-field">
            <span>{t("wallet.topup.amount")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          {error ? <p className="topup-error">{error}</p> : null}
          <div className="topup-modal-actions">
            <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
            <button className="challenge-primary-action" type="button" disabled={!isValid || saving} onClick={handleConfirm}>
              {saving ? t("app.common.loading") : t("wallet.topup.confirm")}
            </button>
          </div>
        </div>
    </Sheet>
  );
}

export function ComparisonInfoModal({ t, onClose }: { t: TFunction; onClose: () => void }) {
  return (
    <Sheet bare className="small comparison-info-modal" ariaLabel={t("wallet.calculator.comparisonInfoTitle")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("wallet.calculator.comparisonInfoTitle")}</h2>
          <span />
        </div>
        <div className="comparison-info-body">
          <p>{t("wallet.calculator.comparisonInfoIntro")}</p>
          <p>{t("wallet.calculator.comparisonInfoFormula")}</p>
          <p>{t("wallet.calculator.comparisonInfoCore")}</p>
          <p>{t("wallet.calculator.comparisonInfoBenchmarks")}</p>
        </div>
    </Sheet>
  );
}

export function FinanceState({ title, description }: { title: string; description: string }) {
  return (
    <div className="finance-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
