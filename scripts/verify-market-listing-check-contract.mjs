import assert from "node:assert/strict";
import { checkListingText, listingFingerprint } from "../lib/marketplaceListingCheck.ts";
import { isPublicForGuests, withAutoCheck, withGuestVisibility, withOperatorReview } from "../lib/marketplaceGuestVisibility.ts";

// Ordinary offers pass.
for (const [title, description] of [
  ["Ремонт велосипедов", "Приеду к вам домой, починю за 2 дня. Цена 1500, срок 3 дня."],
  ["Birthday cakes", "Chocolate or vanilla, 2 kg, delivery within a week."],
  ["Патронаж пожилых", "Помощь по дому и прогулки."]
]) assert.deepEqual(checkListingText({ title, description }), [], title);

// Each rule fires on its typical case.
assert.deepEqual(checkListingText({ title: "Ремонт", description: "пишите в телеграм @bikefix" }), ["contacts"]);
assert.deepEqual(checkListingText({ title: "Repair", description: "call +7 912 345 67 89" }), ["contacts"]);
assert.deepEqual(checkListingText({ title: "Repair", description: "mail me: fix@example.com" }), ["contacts"]);
assert.deepEqual(checkListingText({ title: "Сайт", description: "подробнее на example.com" }), ["external_link"]);
assert.deepEqual(checkListingText({ title: "Сайт", description: "подробнее на магазин.рф" }), ["external_link"]);
assert.deepEqual(checkListingText({ title: "Курс", description: "Гарантированный доход 5% в день" }), ["money_promise"]);
assert.deepEqual(checkListingText({ title: "Course", description: "Passive income for everyone" }), ["money_promise"]);
assert.deepEqual(checkListingText({ title: "Купить диплом", description: "" }), ["prohibited"]);
assert.deepEqual(checkListingText({ title: "СУПЕР ПРЕДЛОЖЕНИЕ ТОЛЬКО СЕГОДНЯ" }), ["shouting"]);
assert.equal(listingFingerprint({ title: "Торт!", description: "Шоколадный,  2 кг" }), listingFingerprint({ title: "торт", description: "шоколадный 2 кг" }));

// Flags hold the listing back from guests; a clean edit releases an automatic hold.
const now = "2026-10-21T00:00:00.000Z";
const held = withAutoCheck({}, ["contacts"], now);
assert.equal(isPublicForGuests(held), false);
assert.equal(isPublicForGuests(withAutoCheck(held, [], now)), true);
assert.equal(isPublicForGuests(withAutoCheck({}, [], now)), true);
// Operator decisions: approval publishes and survives clean edits; a clean edit after rejection goes back to review.
const approved = withOperatorReview(held, "approved", now);
assert.equal(isPublicForGuests(approved), true);
assert.equal(isPublicForGuests(withAutoCheck(approved, [], now)), true);
const rejected = withOperatorReview(held, "rejected", now);
assert.equal(isPublicForGuests(rejected), false);
assert.equal(isPublicForGuests(withAutoCheck(rejected, [], now)), false);
// The seller's own hide setting wins over everything.
assert.equal(isPublicForGuests(withGuestVisibility(approved, true)), false);

console.log("market listing check contract passed");
