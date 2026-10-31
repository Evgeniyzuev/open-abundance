import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Address, Cell } from "@ton/ton";
import { commentPayload, jettonTransferPayload, tonConnectChain } from "../lib/tonConnectPayload.ts";

// Run with: node --experimental-strip-types scripts/verify-tonconnect-contract.mjs
const read = (path) => readFileSync(path, "utf8");

// --- TON transfer: the payload is the invoice comment as a text cell ---
const comment = "oa_ton_5b0f7a0e-1c1c-4f2e-9d3e-0a1b2c3d4e5f";
const textCell = Cell.fromBase64(commentPayload(comment)).beginParse();
assert.equal(textCell.loadUint(32), 0, "op 0 = text comment");
assert.equal(textCell.loadStringTail(), comment);

// --- USDT: TEP-74 Jetton transfer to our deposit owner with the comment forwarded ---
const destination = "0:" + "a".repeat(64);
const sender = "0:" + "b".repeat(64);
const body = Cell.fromBase64(jettonTransferPayload({ amountUnits: "10000000", destinationOwner: destination, responseOwner: sender, comment: "oa_usdt_x", queryId: 7n })).beginParse();
assert.equal(body.loadUint(32), 0x0f8a7ea5, "Jetton transfer op");
assert.equal(body.loadUintBig(64), 7n);
assert.equal(body.loadCoins(), 10000000n, "10 USDT in 6-decimal units");
assert.ok(body.loadAddress().equals(Address.parse(destination)), "Jettons go to our deposit owner");
assert.ok(body.loadAddress().equals(Address.parse(sender)), "excess TON returns to the payer");
assert.equal(body.loadBit(), false, "no custom payload");
assert.equal(body.loadCoins(), 1n, "1 nanoTON forwarded so the notification carries the comment");
assert.equal(body.loadBit(), true);
const forwarded = body.loadRef().beginParse();
assert.equal(forwarded.loadUint(32), 0);
assert.equal(forwarded.loadStringTail(), "oa_usdt_x");
const bare = Cell.fromBase64(jettonTransferPayload({ amountUnits: "1", destinationOwner: destination, responseOwner: sender })).beginParse();
bare.loadUint(32); bare.loadUintBig(64); bare.loadCoins(); bare.loadAddress(); bare.loadAddress(); bare.loadBit(); bare.loadCoins();
assert.equal(bare.loadBit(), false, "a bound sender pays without a comment");

assert.equal(tonConnectChain("mainnet"), "-239");
assert.equal(tonConnectChain("testnet"), "-3");

// --- Wiring: only the person's own open invoice, only a bound address without one; crediting stays with the scanner ---
const route = read("app/api/wallet/deposits/tonconnect/route.ts");
assert.match(route, /\.eq\("user_id", user\.id\)/, "only the person's own invoice");
assert.match(route, /ton_usdt_bound_senders/, "no invoice: a bound sender pays without a comment");
assert.match(route, /create_or_reuse_ton_usdt_deposit_invoice/, "no invoice and not bound: pay with the open invoice comment, so the wallet gets linked");
assert.match(route, /bound_elsewhere/, "a wallet bound to someone else never pays into this account");
assert.doesNotMatch(route, /wallet_ledger|settle_/, "the route never credits");
const manifest = JSON.parse(read("public/tonconnect-manifest.json"));
assert.equal(manifest.url, "https://open-abundance.vercel.app");
assert.match(read("components/TonUsdtWalletModals.tsx"), /<TonConnectPay asset="USDT"/);
assert.match(read("components/wallet/WalletModals.tsx"), /<TonConnectPay asset="TON"/);

console.log("tonconnect contract ok");
