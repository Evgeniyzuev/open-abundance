"use client";

import Sheet from "@/components/ui/Sheet";
import type { MessageKey } from "@/lib/i18n";
import type { WalletFees } from "@/lib/useWalletFees";

export type WalletCryptoMethod = "ton" | "usdtTon" | "cryptoPay";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type WalletCryptoMethodModalProps = {
  direction: "deposit" | "withdraw";
  /** CryptoBot top-up is offered only when the provider is switched on. */
  cryptoPayEnabled?: boolean;
  /** Project fees to show on each method; omitted until loaded. */
  fees?: WalletFees | null;
  t: TFunction;
  onClose: () => void;
  onSelect: (method: WalletCryptoMethod) => void;
};

export function WalletCryptoMethodModal({ direction, cryptoPayEnabled, fees, t, onClose, onSelect }: WalletCryptoMethodModalProps) {
  const title = direction === "deposit" ? t("wallet.deposit.title") : t("wallet.cryptoMethod.withdrawTitle");
  const prompt = direction === "deposit"
    ? t("wallet.cryptoMethod.depositPrompt")
    : t("wallet.cryptoMethod.withdrawPrompt");

  return (
    <Sheet bare className="small" ariaLabel={title} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{title}</h2>
          <span />
        </div>
        <p className="transfer-muted wallet-crypto-method-prompt">{prompt}</p>
        <div className="wallet-crypto-method-list">
          <button className="wallet-crypto-method-card" type="button" onClick={() => onSelect("ton")}>
            <strong>{t("wallet.cryptoMethod.ton")}</strong>
            <span>{t("wallet.cryptoMethod.tonDescription")}</span>
            {fees ? <em className="wallet-fee-line">{direction === "deposit" ? t("fees.deposit.chain", { percent: fees.deposit.tonPercent }) : t("fees.withdraw.percent", { percent: fees.withdraw.tonPercent })}</em> : null}
          </button>
          <button className="wallet-crypto-method-card" type="button" onClick={() => onSelect("usdtTon")}>
            <strong>{t("wallet.cryptoMethod.usdtTon")}</strong>
            <span>{t("wallet.cryptoMethod.usdtTonDescription")}</span>
            {fees ? <em className="wallet-fee-line">{direction === "deposit" ? t("fees.deposit.chain", { percent: fees.deposit.usdtTonPercent }) : t("fees.withdraw.percent", { percent: fees.withdraw.usdtTonPercent })}</em> : null}
          </button>
          {direction === "deposit" && cryptoPayEnabled ? (
            <button className="wallet-crypto-method-card" type="button" onClick={() => onSelect("cryptoPay")}>
              <strong>{t("wallet.cryptoMethod.cryptoPay")}</strong>
              <span>{t("wallet.cryptoMethod.cryptoPayDescription")}</span>
              {fees ? <em className="wallet-fee-line">{t("fees.deposit.cryptoPay", { percent: fees.deposit.cryptoPayPercent })}</em> : null}
            </button>
          ) : null}
        </div>
    </Sheet>
  );
}