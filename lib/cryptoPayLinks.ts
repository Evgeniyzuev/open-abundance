// Which CryptoBot link opens an invoice, and the "credited" message. Pure and import-free: used by the server, by
// the deposit screen and tested directly by node.

export type CryptoPayInvoiceLinks = { miniAppUrl?: string | null; botUrl?: string | null; webAppUrl?: string | null };

/**
 * Inside the Telegram Mini App the invoice opens in CryptoBot's own Mini App without leaving Telegram (falling back to
 * the CryptoBot chat). In a browser the CryptoBot chat link opens the Telegram app; the web version is the last resort.
 */
export function chooseCryptoPayLink(links: CryptoPayInvoiceLinks, inTelegram: boolean): { url: string; inTelegram: boolean } | null {
  const valid = (value: string | null | undefined) => (value && /^https:\/\//.test(value) ? value : null);
  if (inTelegram) {
    const url = valid(links.miniAppUrl) ?? valid(links.botUrl);
    if (url && /^https:\/\/t\.me\//.test(url)) return { url, inTelegram: true };
  }
  const url = valid(links.botUrl) ?? valid(links.webAppUrl) ?? valid(links.miniAppUrl);
  return url ? { url, inTelegram: false } : null;
}

export type CreditedCopy = Record<"en" | "ru" | "es" | "zh" | "hi" | "ar", { title: string; body: string }>;

/** Push and Telegram text for a credited top-up (CryptoBot, TON or USDT), in every app language. */
export function depositCreditedCopy(usdAmount: number): CreditedCopy {
  const amount = `$${usdAmount.toFixed(2)}`;
  return {
    en: { title: `Credited ${amount}`, body: "Your top-up reached your Wallet." },
    ru: { title: `Зачислено ${amount}`, body: "Пополнение пришло на ваш Wallet." },
    es: { title: `Acreditado ${amount}`, body: "Tu recarga llegó a tu Wallet." },
    zh: { title: `已到账 ${amount}`, body: "你的充值已到达钱包。" },
    hi: { title: `${amount} जमा हुए`, body: "आपका टॉप-अप Wallet में पहुँच गया।" },
    ar: { title: `تمت إضافة ${amount}`, body: "وصل الشحن إلى محفظتك." }
  };
}
