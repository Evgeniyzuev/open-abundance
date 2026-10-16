import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeCoreTicker, coreGrowthFactor, coreGrowthPercent, dropsFallen, dropUnit, secondsSinceUtcMidnight, tickerDecimals, TICKER_DAILY_RATE } from "../lib/coreTicker.ts";
import { DAILY_CORE_RATE } from "../lib/coreCalculator.ts";

assert.equal(TICKER_DAILY_RATE, DAILY_CORE_RATE, "the ticker uses the same daily rate as the calculator and the accrual job");

const midnight = new Date("2026-10-16T00:00:00.000Z");
const noon = new Date("2026-10-16T12:00:00.000Z");
const end = new Date("2026-10-16T23:59:59.999Z");
assert.equal(secondsSinceUtcMidnight(midnight), 0);
assert.equal(secondsSinceUtcMidnight(noon), 43200);

const atNoon = computeCoreTicker({ balance: 1000, reinvestPercent: 100, now: noon });
assert.ok(Math.abs(atNoon.perDay - 0.633) < 1e-12, "1000 Core earns 0.633 per day");
assert.ok(Math.abs(atNoon.today - 0.3165) < 1e-9, "half of the day has built up half of the income");
assert.equal(atNoon.todayToWallet, 0, "full reinvest sends nothing to Wallet");
assert.ok(Math.abs(atNoon.dayProgress - 0.5) < 1e-12);

const split = computeCoreTicker({ balance: 1000, reinvestPercent: 25, now: noon });
assert.ok(Math.abs(split.todayToCore - split.today * 0.25) < 1e-12 && Math.abs(split.todayToWallet - split.today * 0.75) < 1e-12, "split follows the reinvest percent");
assert.ok(Math.abs(split.todayToCore + split.todayToWallet - split.today) < 1e-12, "no income is lost or invented in the split");

assert.equal(computeCoreTicker({ balance: 1000, reinvestPercent: 100, now: midnight }).today, 0, "a new UTC day starts from zero");
assert.ok(computeCoreTicker({ balance: 1000, reinvestPercent: 100, now: end }).today <= atNoon.perDay, "never exceeds the day's income");
assert.equal(computeCoreTicker({ balance: -5, reinvestPercent: 150, now: noon }).perDay, 0, "negative balance counts as zero");
assert.equal(computeCoreTicker({ balance: Number.NaN, reinvestPercent: Number.NaN, now: noon }).today, 0, "bad numbers do not break the counter");

assert.equal(tickerDecimals(0), 2);
assert.ok(tickerDecimals(1000 * TICKER_DAILY_RATE / 86400) >= 7 && tickerDecimals(1000 * TICKER_DAILY_RATE / 86400) <= 9, "small balances need many decimals");
assert.equal(tickerDecimals(1e-30), 12, "decimals are capped");

// The scenario text: about x1.26 a year, x2 in three years, x10 in ten (full reinvest, current rate).
assert.ok(Math.abs(coreGrowthFactor(1) - 1.26) < 0.01);
assert.ok(Math.abs(coreGrowthFactor(3) - 2.0) < 0.05);
assert.ok(Math.abs(coreGrowthFactor(10) - 10.1) < 0.3);

// Growth shown as percent for several periods (1.26^N - 1), never as a promise.
assert.equal(Math.round(coreGrowthPercent(1)), 26);
assert.equal(Math.round(coreGrowthPercent(3)), 100);
assert.ok(Math.round(coreGrowthPercent(10)) >= 900 && Math.round(coreGrowthPercent(10)) <= 915);
assert.ok(coreGrowthPercent(30) > 100_000, "thirty years compounds to several hundred times");
assert.equal(coreGrowthPercent(0), 0);

// A water drop is worth 1, 2 or 5 x 10^k and falls every one to two and a half seconds.
for (const balance of [1, 10, 100, 1000, 12345, 1_000_000]) {
  const perSecond = balance * TICKER_DAILY_RATE / 86400;
  const unit = dropUnit(perSecond);
  const seconds = unit / perSecond;
  assert.ok(seconds >= 0.999 && seconds <= 2.51, `balance ${balance}: a drop every ${seconds.toFixed(2)} s`);
  const mantissa = unit / Math.pow(10, Math.floor(Math.log10(unit)));
  assert.ok([1, 2, 5].some((step) => Math.abs(mantissa - step) < 1e-9), "unit is 1, 2 or 5 times a power of ten");
}
assert.equal(dropUnit(0), 0);
assert.equal(dropsFallen(0.00001, 0.00001), 1);
assert.equal(dropsFallen(0.000019, 0.00001), 1);
assert.equal(dropsFallen(5, 0), 0);

// The counter component only reads balances; it never calls the server or writes data.
const component = readFileSync(new URL("../components/CoreIncomeTicker.tsx", import.meta.url), "utf8");
assert.ok(!/fetch\(|supabase|apply[A-Z]\w*\(/.test(component), "the counter is read-only");
console.log("Core ticker contract verified.");
