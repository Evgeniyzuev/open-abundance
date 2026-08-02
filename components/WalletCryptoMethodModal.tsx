"use client";

import type { MessageKey } from "@/lib/i18n";

export type WalletCryptoMethod = "ton" | "usdtTon";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type WalletCryptoMethodModalProps = {
  direction: "deposit" | "withdraw";
  t: TFunction;
  onClose: () => void;
  onSelect: (method: WalletCryptoMethod) => void;
};

export function WalletCryptoMethodModal({ direction, t, onClose, onSelect }: WalletCryptoMethodModalProps) {
  const title = direction === "deposit" ? t("wallet.deposit.title") : t("wallet.cryptoMethod.withdrawTitle");
  const prompt = direction === "deposit"
    ? t("wallet.cryptoMethod.depositPrompt")
    : t("wallet.cryptoMethod.withdrawPrompt");

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
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
          </button>
          <button className="wallet-crypto-method-card" type="button" onClick={() => onSelect("usdtTon")}>
            <strong>{t("wallet.cryptoMethod.usdtTon")}</strong>
            <span>{t("wallet.cryptoMethod.usdtTonDescription")}</span>
          </button>
        </div>
      </section>
    </div>
  );
}