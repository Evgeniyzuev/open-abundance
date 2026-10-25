"use client";

// One TON Connect instance for the whole app, loaded only when a person opens "Pay from wallet". The person's own
// wallet (Tonkeeper, MyTonWallet, the non-custodial part of Wallet in Telegram) signs a transaction our server
// prepared; nothing here holds keys or credits money.
import type { SendTransactionRequest, TonConnectUI } from "@tonconnect/ui";

let instance: Promise<TonConnectUI> | null = null;

export function getTonConnect(language: string): Promise<TonConnectUI> {
  if (!instance) {
    instance = import("@tonconnect/ui").then(({ TonConnectUI }) => {
      const ui = new TonConnectUI({ manifestUrl: `${window.location.origin}/tonconnect-manifest.json`, language: language === "ru" ? "ru" : "en" });
      return ui.connectionRestored.then(() => ui);
    });
    instance.catch(() => { instance = null; });
  }
  return instance;
}

/** The connected wallet's raw address, or null. */
export function connectedAddress(ui: TonConnectUI): string | null {
  return ui.account?.address ?? null;
}

/** Opens the wallet list and resolves with the address once a wallet connects, or null when the list is closed. */
export function connectWallet(ui: TonConnectUI): Promise<string | null> {
  const current = connectedAddress(ui);
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => { if (settled) return; settled = true; stopStatus(); stopModal(); resolve(value); };
    const stopStatus = ui.onStatusChange((wallet) => { if (wallet?.account?.address) finish(wallet.account.address); });
    const stopModal = ui.onModalStateChange((state) => { if (state.status === "closed") window.setTimeout(() => finish(connectedAddress(ui)), 300); });
    void ui.openModal();
  });
}

export async function sendPreparedTransaction(ui: TonConnectUI, transaction: SendTransactionRequest): Promise<void> {
  await ui.sendTransaction(transaction);
}
