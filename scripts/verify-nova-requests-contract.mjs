import assert from "node:assert/strict";
import { buildCollection, canAct, hasContacts, parseMessageText, parseRequestText, pickHelpers, roleFor, viewRequest } from "../lib/novaRequests.ts";

// Text rules: no contacts or links until both sides agreed.
assert.deepEqual(parseRequestText("  Нужен   взгляд на резюме  "), { text: "Нужен взгляд на резюме" });
assert.deepEqual(parseRequestText("ок"), { problem: "length" });
assert.deepEqual(parseRequestText("x".repeat(401)), { problem: "length" });
assert.deepEqual(parseRequestText("Напишите мне в телеграм @ivan_petrov"), { problem: "contacts" });
assert.deepEqual(parseRequestText("Гляньте сайт example.com пожалуйста"), { problem: "contacts" });
assert.equal(hasContacts("Хочу найти напарника для пробежек по утрам"), false);
assert.deepEqual(parseMessageText("мой номер +7 999 123 45 67", false), { problem: "contacts" });
assert.deepEqual(parseMessageText("мой номер +7 999 123 45 67", true), { text: "мой номер +7 999 123 45 67" });
assert.deepEqual(parseMessageText("", true), { problem: "length" });

const A = "a", B = "b", C = "c";
const base = { id: "r1", requester_user_id: A, kind: "help", body: "Разобрать резюме", status: "open", helper_user_id: null, requester_reveal: false, helper_reveal: false, helped: null, closed_by: null, created_at: "2026-11-14T00:00:00Z" };
const offer = (helper, status) => ({ id: `o-${helper}`, request_id: "r1", helper_user_id: helper, status });

// Roles and the two consents.
assert.equal(roleFor(base, null, A), "requester");
assert.equal(roleFor(base, null, B), "invited", "an open request may be answered by anyone else");
assert.equal(roleFor(base, offer(B, "released"), B), "none");
assert.equal(canAct("can", "invited", base, null), true);
assert.equal(canAct("can", "invited", base, offer(B, "ready")), false, "«Могу» is said once");
assert.equal(canAct("can", "requester", base, null), false, "nobody answers their own request");
assert.equal(canAct("connect", "requester", base, null), true);
assert.equal(canAct("connect", "invited", base, offer(B, "ready")), false, "only the requester gives the second consent");
assert.equal(canAct("message", "requester", base, null), false, "no messages before both agreed");

const matched = { ...base, status: "matched", helper_user_id: B };
assert.equal(roleFor(matched, offer(B, "connected"), B), "helper");
assert.equal(roleFor(matched, offer(C, "released"), C), "none");
assert.equal(roleFor(matched, null, C), "none", "a matched request is closed to outsiders");
assert.equal(canAct("message", "helper", matched, null), true);
assert.equal(canAct("close", "helper", matched, null), true, "either side may leave");
assert.equal(canAct("cancel", "requester", matched, null), false);

// Views never leak the other side.
const names = new Map([[A, "Анна"], [B, "Борис"]]);
const offers = [offer(B, "ready"), offer(C, "asked")];
const mine = viewRequest({ request: base, offers, messages: [], userId: A, names });
assert.deepEqual(mine.ready, [{ offerId: "o-b" }]);
assert.equal(mine.otherName, null);
assert.ok(!JSON.stringify(mine).includes("Борис") && !JSON.stringify(mine).includes('"b"'), "the requester does not learn who said «Могу»");
const invited = viewRequest({ request: base, offers, messages: [], userId: B, names });
assert.equal(invited.saidCan, true);
assert.deepEqual(invited.ready, [], "a helper does not see other helpers");
assert.ok(!JSON.stringify(invited).includes("Анна"));
assert.equal(viewRequest({ request: base, offers: [offer(C, "passed")], messages: [], userId: C, names }), null, "«Не сейчас» hides the request");

const messages = [{ id: "m1", request_id: "r1", sender_user_id: A, body: "Привет", created_at: "2026-11-14T01:00:00Z" }];
const helperView = viewRequest({ request: matched, offers, messages, userId: B, names });
assert.deepEqual(helperView.messages, [{ id: "m1", mine: false, body: "Привет", createdAt: "2026-11-14T01:00:00Z" }]);
assert.equal(helperView.otherName, null);
const oneSided = viewRequest({ request: { ...matched, requester_reveal: true }, offers, messages, userId: B, names });
assert.equal(oneSided.otherName, null, "one side showing a name is not enough");
assert.equal(oneSided.theyRevealed, true);
const both = { ...matched, requester_reveal: true, helper_reveal: true };
assert.equal(viewRequest({ request: both, offers, messages, userId: B, names }).otherName, "Анна");
assert.equal(viewRequest({ request: both, offers, messages, userId: A, names }).otherName, "Борис");
assert.equal(viewRequest({ request: matched, offers, messages, userId: C, names }), null);
assert.equal(viewRequest({ request: { ...matched, helped: true }, offers, messages, userId: B, names }).helped, null, "the answer «помогло» is not shown to the helper as a rating");

// Who Nova asks: consented people only, recent first, never the requester or excluded accounts.
assert.deepEqual(pickHelpers({ requesterId: A, consented: [A, B, C, "d", "d", "qa"], lastActive: new Map([[B, 1], [C, 5], ["d", 3]]), excluded: (id) => id === "qa" }), [C, "d", B]);
assert.equal(pickHelpers({ requesterId: A, consented: ["1", "2", "3", "4", "5", "6", "7"], lastActive: new Map() }).length, 5);

// Answers through Nova: no connection, no names; the author may continue with one person or close.
const answerRows = [{ id: "a1", request_id: "r1", sender_user_id: B, body: "Уберите лишние курсы", created_at: "2026-11-14T02:00:00Z" }];
assert.equal(canAct("answer", "invited", base, null), true);
assert.equal(canAct("answer", "requester", base, null), false);
assert.equal(canAct("close", "requester", base, null), true, "an open request may be closed after answers");
assert.equal(canAct("close", "invited", base, null), false);
const withAnswers = viewRequest({ request: base, offers, messages: answerRows, userId: A, names });
assert.deepEqual(withAnswers.answers, [{ offerId: "o-b", body: "Уберите лишние курсы" }]);
assert.deepEqual(withAnswers.messages, [], "answers are not a conversation yet");
assert.ok(!JSON.stringify(withAnswers).includes('"b"'));
assert.equal(viewRequest({ request: base, offers, messages: answerRows, userId: B, names }).myAnswer, "Уберите лишние курсы");
assert.equal(viewRequest({ request: base, offers, messages: answerRows, userId: C, names }).myAnswer, null, "nobody sees another person's answer");
const afterConnect = viewRequest({ request: { ...matched, helper_user_id: C }, offers, messages: [...answerRows, ...messages], userId: C, names });
assert.deepEqual(afterConnect.messages.map((message) => message.id), ["m1"], "the connected helper does not see other people's answers");

// Collection: different people count once, anonymous connections count too, only mutual names are contacts.
const link = (requester, helper, kind, both = false) => ({ requester_user_id: requester, helper_user_id: helper, kind, requester_reveal: both, helper_reveal: both });
const collection = buildCollection([link(A, B, "help"), link(A, B, "help"), link(C, A, "talk", true), link(A, null, "advice"), link(B, C, "partner"), { ...link(A, "d", "advice"), requester_reveal: true }], A);
assert.deepEqual(collection, { people: 3, named: 1, byKind: { advice: 1, help: 1, partner: 0, talk: 1 }, gave: 1, received: 2, nextStep: 5 });
assert.equal(buildCollection([], A).nextStep, 1);
console.log("nova requests contract ok");
