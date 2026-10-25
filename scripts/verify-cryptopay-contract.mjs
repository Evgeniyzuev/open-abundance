import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { grossUpForFee } from "../lib/cryptoPayFee.ts";
import { chooseCryptoPayLink, depositCreditedCopy } from "../lib/cryptoPayLinks.ts";
import { invoiceMatches, parseUsdAmount, readCryptoPayConfig, verifyCryptoPaySignature, webhookIsFresh } from "../lib/cryptoPayCore.ts";

// Run with: node --experimental-strip-types scripts/verify-cryptopay-contract.mjs
const read = (path) => readFileSync(path, "utf8");

// --- Webhook signature: HMAC-SHA256 of the raw body, keyed with SHA-256(token), hex ---
const token = "12345:AAtesttoken";
const body = JSON.stringify({ update_id: 1, update_type: "invoice_paid", request_date: "2026-10-12T10:00:00Z", payload: { invoice_id: 77 } });
const signature = createHmac("sha256", createHash("sha256").update(token).digest()).update(body).digest("hex");
assert.equal(verifyCryptoPaySignature(body, signature, token), true);
assert.equal(verifyCryptoPaySignature(body, signature.toUpperCase(), token), true, "hex case does not matter");
assert.equal(verifyCryptoPaySignature(body + " ", signature, token), false, "a changed body fails");
assert.equal(verifyCryptoPaySignature(body, signature, "other-token"), false, "another token fails");
assert.equal(verifyCryptoPaySignature(body, "", token), false);
assert.equal(verifyCryptoPaySignature(body, null, token), false);
assert.equal(verifyCryptoPaySignature(body, "zz".repeat(32), token), false, "not hex");
assert.equal(verifyCryptoPaySignature(body, signature.slice(0, 10), token), false, "wrong length");

// --- Freshness ---
const now = Date.parse("2026-10-12T10:05:00Z");
assert.equal(webhookIsFresh("2026-10-12T10:00:00Z", now), true);
assert.equal(webhookIsFresh("2026-10-12T09:00:00Z", now), false, "an hour old is a replay");
assert.equal(webhookIsFresh(undefined, now), false);
assert.equal(webhookIsFresh("not a date", now), false);

// --- The provider's record must be exactly our invoice, fully paid ---
const expected = { id: "5b0f7a0e-1c1c-4f2e-9d3e-0a1b2c3d4e5f", usdAmount: 10, providerInvoiceId: "77" };
const good = { invoice_id: 77, status: "paid", currency_type: "fiat", fiat: "USD", amount: "10.00", payload: expected.id };
assert.deepEqual(invoiceMatches(good, expected), { ok: true });
assert.equal(invoiceMatches(null, expected).ok, false);
assert.equal(invoiceMatches({ ...good, status: "active" }, expected).reason, "status_active", "an unpaid invoice is not credited");
assert.equal(invoiceMatches({ ...good, status: "expired" }, expected).reason, "status_expired");
assert.equal(invoiceMatches({ ...good, amount: "9.00" }, expected).reason, "amount_mismatch", "a different amount is not credited");
assert.equal(invoiceMatches({ ...good, payload: "someone-else" }, expected).reason, "payload_mismatch", "an invoice with another id is not ours");
assert.equal(invoiceMatches({ ...good, invoice_id: 78 }, expected).reason, "invoice_id_mismatch");
assert.equal(invoiceMatches({ ...good, fiat: "EUR" }, expected).reason, "not_usd");
assert.equal(invoiceMatches({ ...good, currency_type: "crypto" }, expected).reason, "not_usd");

// --- Configuration: the test network is the default and nothing runs without a token ---
assert.equal(readCryptoPayConfig({}).ready, false);
assert.equal(readCryptoPayConfig({}).network, "testnet");
assert.equal(readCryptoPayConfig({ CRYPTO_PAY_ENABLED: "true" }).reason, "missing_token");
const live = readCryptoPayConfig({ CRYPTO_PAY_ENABLED: '"true"', CRYPTO_PAY_TOKEN: ' "abc" ', CRYPTO_PAY_NETWORK: "MAINNET", CRYPTO_PAY_MAX_USD: "20" });
assert.equal(live.ready, true);
assert.equal(live.token, "abc", "quotes and spaces from a dashboard paste are removed");
assert.equal(live.network, "mainnet");
assert.equal(live.baseUrl, "https://pay.crypt.bot/api");
assert.equal(live.maxUsd, 20);
assert.equal(readCryptoPayConfig({ CRYPTO_PAY_ENABLED: "true", CRYPTO_PAY_TOKEN: "x" }).baseUrl, "https://testnet-pay.crypt.bot/api");
assert.equal(readCryptoPayConfig({ CRYPTO_PAY_NETWORK: "prod" }).network, "testnet", "anything but mainnet is the test network");

// --- Amounts ---
assert.equal(parseUsdAmount("10", 1, 50), 10);
assert.equal(parseUsdAmount("10,5", 1, 50), 10.5);
assert.equal(parseUsdAmount(0.5, 1, 50), null, "below the minimum");
assert.equal(parseUsdAmount(51, 1, 50), null, "above the maximum");
assert.equal(parseUsdAmount("1.005", 1, 50), null, "not a whole cent");
assert.equal(parseUsdAmount("abc", 1, 50), null);

// --- The project never pays for a deposit: the invoice carries the provider's share ---
assert.equal(grossUpForFee(5, 3), 5.16, "5 chosen, 3% share: invoice 5.16");
assert.equal(grossUpForFee(10, 3), 10.31);
assert.equal(grossUpForFee(1, 3), 1.04);
assert.equal(grossUpForFee(100, 0), 100, "no share, no gross-up");
for (const credit of [1, 5, 7.5, 10, 25, 49.99, 50]) {
  const invoiced = grossUpForFee(credit, 3);
  assert.ok(invoiced * 0.97 >= credit - 1e-9, `after 3% of ${invoiced} at least ${credit} remains`);
  assert.ok(invoiced * 0.97 - credit < 0.011, `and not more than a cent extra for ${credit}`);
}
assert.equal(readCryptoPayConfig({}).feePercent, 3, "the provider share defaults to the measured 3%");
assert.equal(readCryptoPayConfig({ CRYPTO_PAY_FEE_PERCENT: "2.5" }).feePercent, 2.5);

// --- Wiring ---
const sql = read("supabase/migrations/20261012100000_payment_provider_invoices.sql");
assert.match(sql, /if v_invoice\.network <> 'mainnet' then/, "a test-network payment never credits a Wallet, enforced in the database");
assert.match(sql, /'payment_provider:' \|\| v_invoice\.id::text/, "one ledger row per invoice");
assert.match(sql, /status in \('credited', 'paid_test'\)/, "a second settle returns the first result");
assert.match(sql, /revoke all on public\.payment_provider_invoices from public, anon, authenticated/, "server-only table");
const webhook = read("app/api/webhooks/cryptopay/route.ts");
assert.match(webhook, /verifyCryptoPaySignature/, "an unsigned webhook is refused");
assert.match(webhook, /confirmAndSettle/, "the webhook is confirmed with the provider before crediting");
const lib = read("lib/cryptoPay.ts");
assert.match(lib, /getCryptoPayInvoice/, "the provider is asked again before crediting");
assert.match(lib, /invoiceMatches\(remote, expected\)/);
const route = read("app/api/wallet/deposits/cryptopay/route.ts");
assert.match(route, /MAX_OPEN_INVOICES/);
assert.match(route, /grossUpForFee\(usdAmount, config\.feePercent\)/, "the invoice is raised by the provider share");
assert.match(route, /pay_usd_amount: payAmount/, "the invoiced amount is stored next to the credited one");
assert.match(lib, /row\.pay_usd_amount \?\? row\.usd_amount/, "the provider invoice is matched against the invoiced amount, the Wallet is credited the chosen one");
assert.match(route, /config\.dailyUsd/, "a daily cap per person");
assert.match(route, /payload.*|invoiceId: id/);
assert.doesNotMatch(lib + route + webhook, /console\.(log|error)\([^)]*token/i, "the token is never logged");

// --- Where the invoice opens: inside Telegram in the Mini App, the CryptoBot chat link elsewhere ---
const links = { miniAppUrl: "https://t.me/CryptoBot/app?startapp=invoice-IV1", botUrl: "https://t.me/CryptoBot?start=IV1", webAppUrl: "https://app.send.tg/invoices/IV1" };
assert.deepEqual(chooseCryptoPayLink(links, true), { url: links.miniAppUrl, inTelegram: true }, "the Mini App opens CryptoBot's Mini App");
assert.deepEqual(chooseCryptoPayLink({ ...links, miniAppUrl: null }, true), { url: links.botUrl, inTelegram: true }, "then the CryptoBot chat");
assert.deepEqual(chooseCryptoPayLink(links, false), { url: links.botUrl, inTelegram: false }, "a browser gets the CryptoBot chat link");
assert.deepEqual(chooseCryptoPayLink({ webAppUrl: links.webAppUrl }, false), { url: links.webAppUrl, inTelegram: false }, "the web version is the last resort");
assert.equal(chooseCryptoPayLink({ botUrl: "javascript:alert(1)" }, false), null, "only https links");
assert.equal(chooseCryptoPayLink({}, true), null);
assert.equal(depositCreditedCopy(10).ru.title, "Зачислено $10.00");
assert.equal(depositCreditedCopy(1.5).en.title, "Credited $1.50");

// --- "Credited" message once, sent at once; the background check credits a missed webhook ---
assert.match(read("lib/depositNotify.ts"), /deposit-credited:\$\{input.sourceId\}/, "one credited message per deposit");
assert.match(read("lib/depositNotify.ts"), /p_push: true/, "the message is a push with a Telegram copy");
assert.match(read("lib/depositNotify.ts"), /sendQueuedTelegramCopies/, "the Telegram copy is sent right away");
assert.match(lib, /notifyDepositCredited/);
assert.match(lib, /paid_btn_name: "openBot"/, "CryptoBot offers a button back to the Mini App");
const reconcile = read("app/api/internal/payments/reconcile/route.ts");
assert.match(reconcile, /x-ton-scanner-secret/, "the background check needs the scanner secret");
assert.match(reconcile, /confirmAndSettle/, "it settles through the same idempotent path");
assert.match(reconcile, /manual_review/, "a paid invoice that cannot be credited is never marked expired");
const cron = read("supabase/migrations/20261025190000_payment_invoice_reconcile.sql");
assert.match(cron, /where status = 'active'/, "the job calls the app only while invoices are open");
assert.match(cron, /'\*\/5 \* \* \* \*'/);
const modal = read("components/CryptoPayDepositModal.tsx");
assert.match(modal, /openTelegramLink/, "the invoice opens inside Telegram");

console.log("cryptopay contract ok");
