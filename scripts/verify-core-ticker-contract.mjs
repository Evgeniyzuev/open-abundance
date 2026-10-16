import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeCoreTicker, coreGrowthFactor, secondsSinceUtcMidnight, tickerDecimals, TICKER_DAILY_RATE } from "../lib/coreTicker.ts";
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

// The counter component only reads balances; it never calls the server or writes data.
const component = readFileSync(new URL("../components/CoreIncomeTicker.tsx", import.meta.url), "utf8");
assert.ok(!/fetch\(|supabase|apply[A-Z]\w*\(/.test(component), "the counter is read-only");
console.log("Core ticker contract verified.");
