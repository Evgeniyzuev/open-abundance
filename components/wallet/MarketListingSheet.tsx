"use client";

import { useState } from "react";
import { ArrowLeftRight, Pencil, ShoppingBag, Trash2 } from "lucide-react";
import ConfirmPurchase from "@/components/ConfirmPurchase";
import Sheet from "@/components/ui/Sheet";
import { UserNameWithLevel } from "@/components/UserLevelBadge";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import type { MarketplaceListing, TFunction } from "@/components/wallet/walletTypes";
import { artifactInitial, listingImage, sellerName } from "@/components/wallet/walletHelpers";

/**
 * A Market listing as a tile of the 3-column grid, the same look as wishes: the picture, the price on top, the title
 * over the picture. A tap opens the full-screen card below.
 */
export function MarketListingTile({ listing, locale, own, t, onOpen }: { listing: MarketplaceListing; locale: AppLocale; own: boolean; t: TFunction; onOpen: () => void }) {
  const image = listingImage(listing);
  return (
    <button className="wish-tile market-tile" type="button" onClick={onOpen}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img alt="" src={image} loading="lazy" /> : <div className="wish-tile-placeholder">{artifactInitial(listing)}</div>}
      <em>{formatAdaptiveMoney(Number(listing.price_amount), locale)}</em>
      {own ? <em className="market-tile-own">{t("market.yours")}</em> : null}
      <span>{listing.title}</span>
    </button>
  );
}

/** Full-screen card of a listing (like a wish): big picture, description, terms, and the actions. */
export function MarketListingSheet({
  listing,
  locale,
  own,
  t,
  busy,
  onClose,
  onBuy,
  onExchange,
  onEdit,
  onCancel
}: {
  listing: MarketplaceListing;
  locale: AppLocale;
  own: boolean;
  t: TFunction;
  busy: boolean;
  onClose: () => void;
  onBuy: () => void;
  onExchange?: () => void;
  onEdit?: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const image = listingImage(listing);
  const price = formatAdaptiveMoney(Number(listing.price_amount), locale);
  const kind = listing.listing_kind ?? "digital_asset";
  const kindLabel = kind === "physical_good" ? t("market.kind.physical") : t(`market.kind.${kind}` as MessageKey);
  const rating = listing.rating_count ? (Number(listing.rating_sum ?? 0) / Number(listing.rating_count)).toFixed(1) : null;

  return (
    <Sheet bare fullscreen className="wish-modal market-sheet" ariaLabel={listing.title} onClose={onClose}>
      <div className="modal-header">
        <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
        <h2>{t("market.details")}</h2>
        <span />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img className="wish-modal-image" alt="" src={image} /> : <div className="wish-modal-placeholder">{artifactInitial(listing)}</div>}
      <div className="wish-modal-body">
        <h3 className="market-sheet-title">{listing.title}</h3>
        <div className="wish-meta">
          <span>{price}</span>
          <span>{kindLabel}</span>
          {listing.category ? <span>{listing.category}</span> : null}
          <span>{t("market.salesCount", { count: listing.sales_count ?? 0 })}</span>
          {rating ? <span>★ {rating}</span> : null}
        </div>
        <p className="market-sheet-seller">
          {own ? t("market.yours") : (
            <UserNameWithLevel label={listing.sellerProfile?.level ? t("profile.levelBadge", { level: listing.sellerProfile.level }) : undefined} level={listing.sellerProfile?.level || undefined}>
              {sellerName(listing)}
            </UserNameWithLevel>
          )}
        </p>
        {listing.description ? <p className="market-sheet-description">{listing.description}</p> : null}
        {listing.fulfillment_days ? <small>{t("market.fulfillment")}: {listing.fulfillment_days}</small> : null}
        <div className="wish-detail-actions">
          {own ? (
            <>
              {onEdit ? (
                <button className="secondary-button" type="button" onClick={onEdit}><Pencil size={16} />{t("market.edit")}</button>
              ) : null}
              <button className="secondary-button danger" type="button" disabled={busy} onClick={onCancel}><Trash2 size={16} />{busy ? t("app.common.loading") : t("market.cancel")}</button>
            </>
          ) : (
            <>
              <button className="task-done-primary-button" type="button" disabled={busy} onClick={() => setConfirming(true)}>
                <ShoppingBag size={16} />{busy ? t("app.common.loading") : `${t("market.buy")} · ${price}`}
              </button>
              {onExchange ? (
                <button className="secondary-button" type="button" onClick={onExchange}><ArrowLeftRight size={16} />{t("market.exchange.short")}</button>
              ) : null}
            </>
          )}
        </div>
        <small className="market-sheet-terms">{t("market.termsVersion")}: {listing.terms_version ?? 1}{listing.terms_hash ? ` · ${listing.terms_hash.slice(0, 12)}…` : ""}</small>
      </div>
      {confirming ? (
        <ConfirmPurchase
          title={listing.title}
          price={price}
          note="purchase.confirm.noteMarket"
          busy={busy}
          onConfirm={() => { setConfirming(false); onBuy(); }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </Sheet>
  );
}
