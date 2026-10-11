import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
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
assert.match(route, /config\.dailyUsd/, "a daily cap per person");
assert.match(route, /payload.*|invoiceId: id/);
assert.doesNotMatch(lib + route + webhook, /console\.(log|error)\([^)]*token/i, "the token is never logged");

console.log("cryptopay contract ok");
