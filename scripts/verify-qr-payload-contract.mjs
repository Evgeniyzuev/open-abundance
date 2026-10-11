import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTonAddress, parseScanned } from "../lib/qrPayload.ts";

// Run with: node --experimental-strip-types scripts/verify-qr-payload-contract.mjs
const read = (path) => readFileSync(path, "utf8");

const friendly = "UQ" + "A".repeat(46);
const bounceable = "EQ" + "b_-".repeat(15) + "xx".slice(0, 1);
assert.equal(friendly.length, 48);
assert.equal(isTonAddress(friendly), true);
assert.equal(isTonAddress("0:" + "ab".repeat(32)), true, "raw form");
assert.equal(isTonAddress("UQshort"), false);
assert.equal(isTonAddress(bounceable.padEnd(48, "z")), true);

// --- TON ---
assert.deepEqual(parseScanned(friendly), { kind: "ton", address: friendly });
assert.deepEqual(parseScanned(`ton://transfer/${friendly}?amount=1500000000&text=thanks`), { kind: "ton", address: friendly, amountNano: "1500000000", comment: "thanks" });
assert.deepEqual(parseScanned(`https://app.tonkeeper.com/transfer/${friendly}?amount=5`), { kind: "ton", address: friendly, amountNano: "5" });
assert.equal(parseScanned(`ton://transfer/notanaddress`).kind, "unknown");
assert.equal(parseScanned(`ton://transfer/${friendly}?amount=abc`).amountNano, undefined, "a bad amount is ignored");

// --- Open Abundance ---
assert.deepEqual(parseScanned("@Ivan4821"), { kind: "nick", nickname: "ivan4821" });
assert.deepEqual(parseScanned("https://open-abundance.vercel.app/@ivan4821"), { kind: "nick", nickname: "ivan4821" });
assert.deepEqual(parseScanned("https://open-abundance.vercel.app/pay/@ivan4821"), { kind: "nick", nickname: "ivan4821" });
const id = "aeac7ca3-77ac-4613-94ae-27336d926352";
assert.deepEqual(parseScanned(`https://open-abundance.vercel.app/u/${id}`), { kind: "user", userId: id });
assert.deepEqual(parseScanned(`https://open-abundance.vercel.app/?pay=${id}`), { kind: "pay", requestId: id });

// --- Anything else is refused, never guessed ---
assert.equal(parseScanned("hello").kind, "unknown");
assert.equal(parseScanned("").kind, "unknown");
assert.equal(parseScanned("@ab").kind, "unknown", "too short for a nickname");
assert.equal(parseScanned("https://example.com/other").kind, "unknown");
assert.equal(parseScanned("x".repeat(3000)).kind, "unknown");

// --- Wiring ---
const wallet = read("components/WalletApp.tsx");
assert.match(wallet, /oa-economy-open\.v1/, "the folded state is remembered");
assert.match(wallet, /aria-expanded=\{open\}/);
assert.match(wallet, /scanned\.kind === "ton"/, "the TON withdrawal field takes a scanned address");
assert.match(wallet, /applyScannedRecipient/, "a scanned person link selects the recipient");
assert.match(read("components/TonUsdtWalletModals.tsx"), /QrScanButton/, "the USDT withdrawal field has the scanner");
const scanner = read("components/QrScanner.tsx");
assert.match(scanner, /BarcodeDetector/);
assert.match(scanner, /import\("jsqr"\)/, "jsQR is loaded only when the browser has no detector");
assert.match(scanner, /track\.stop\(\)/, "the camera is released when the scanner closes");
assert.match(scanner, /type="file"/, "a picture can be used when the camera is not allowed");

console.log("qr payload contract ok");
