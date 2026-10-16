import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROWTH_POPUP_MIN, GROWTH_POPUP_WINDOW_MS, parseGrowthPopupSetting, shouldShowGrowthPopup } from "../lib/coreGrowthPopup.ts";

// The switch: on by default, off only by an explicit "0".
assert.equal(parseGrowthPopupSetting(null), true);
assert.equal(parseGrowthPopupSetting(undefined), true);
assert.equal(parseGrowthPopupSetting("1"), true);
assert.equal(parseGrowthPopupSetting("0"), false);

const now = 1_000_000;
const announced = { balance: 100, expiresAt: now + GROWTH_POPUP_WINDOW_MS };
const show = (patch) => shouldShowGrowthPopup({ announced, next: 110, enabled: true, now, ...patch });

assert.equal(show({}), true, "a top-up that raised Core opens the popup");
assert.equal(show({ enabled: false }), false, "the switch turns it off");
assert.equal(show({ announced: null }), false, "a rise nobody announced (accrual, reload) stays quiet");
assert.equal(show({ now: announced.expiresAt + 1 }), false, "an old announcement expires");
assert.equal(show({ next: 100 }), false, "no rise, no popup");
assert.equal(show({ next: 100.1 }), true, "even a ten-cent top-up opens it");
assert.equal(show({ next: 99 }), false, "a fall never opens it");
assert.equal(show({ next: Number.NaN }), false, "bad numbers never open it");

// Wiring: both the top-up and a garden purchase announce, and the popup reads only the balance.
const wallet = readFileSync(new URL("../components/WalletApp.tsx", import.meta.url), "utf8");
assert.ok(wallet.includes("announceGrowth();") && wallet.includes("onPurchased={async () => { announceGrowth();"), "top-up and purchase announce growth");
assert.ok(wallet.includes("<CoreGrowthPopup"), "the popup is mounted in Wallet");
const row = readFileSync(new URL("../components/CorePlayRow.tsx", import.meta.url), "utf8");
for (const part of ["corePlay.tree", "corePlay.garden", "afterburn.title", "role=\"switch\""]) assert.ok(row.includes(part), `the row has ${part}`);
const popup = readFileSync(new URL("../components/CoreGrowthPopup.tsx", import.meta.url), "utf8");
assert.ok(!/fetch\(|supabase/.test(popup), "the popup is read-only");

// Every key exists in both languages.
const ru = readFileSync(new URL("../lib/messages/ru.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../lib/messages/en.ts", import.meta.url), "utf8");
for (const key of ["corePlay.label", "corePlay.tree", "corePlay.garden", "corePlay.popup", "coreGrowth.title", "coreGrowth.gain", "coreGrowth.close"]) {
  assert.ok(ru.includes(`"${key}":`) && en.includes(`"${key}":`), `both languages have ${key}`);
}
console.log("Core growth popup contract verified.");
