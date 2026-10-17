"use client";

import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";

/**
 * "Are you sure?" window before money moves: what is being bought, for how much, and where the money goes.
 * The buy button of the Shop and the Market opens it; only its confirm button starts the purchase.
 */
export default function ConfirmPurchase({ title, price, note, busy = false, onConfirm, onCancel }: {
  title: string;
  /** The price already formatted for the screen. */
  price: string;
  note?: MessageKey;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useUserContext();
  return (
    <Sheet bare className="small confirm-purchase" ariaLabel={t("purchase.confirm.title")} onClose={onCancel}>
      <h2>{t("purchase.confirm.title")}</h2>
      <dl className="confirm-purchase-details">
        <div><dt>{t("purchase.confirm.what")}</dt><dd>{title}</dd></div>
        <div><dt>{t("purchase.confirm.price")}</dt><dd>{price}</dd></div>
      </dl>
      {note ? <p className="confirm-purchase-note">{t(note)}</p> : null}
      <div className="modal-action-row">
        <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>{t("app.common.cancel")}</button>
        <button className="challenge-primary-action" type="button" disabled={busy} onClick={onConfirm}>{busy ? t("app.common.loading") : t("purchase.confirm.pay", { amount: price })}</button>
      </div>
    </Sheet>
  );
}
