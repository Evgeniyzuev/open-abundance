import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RESERVED_USERNAMES,
  USERNAME_MAX,
  USERNAME_MIN,
  looksLikeEmail,
  normalizeUsernameInput,
  transliterate,
  usernameBase,
  usernameCandidates,
  validateUsername
} from "../lib/username.ts";
import { personHandle, personLabel, personName, usernameMatchRank } from "../lib/personName.ts";

// Run with: node --experimental-strip-types scripts/verify-username-contract.mjs

const read = (path) => readFileSync(path, "utf8");

// --- Format ---
assert.deepEqual(validateUsername("ivan4821"), { ok: true, value: "ivan4821" });
assert.deepEqual(validateUsername("@Ivan4821"), { ok: true, value: "ivan4821" }, "case and a leading @ are ignored");
assert.deepEqual(validateUsername("abcd"), { ok: false, reason: "too_short" });
assert.equal(validateUsername("a".repeat(USERNAME_MAX + 1)).reason, "too_long");
assert.equal(validateUsername("a".repeat(USERNAME_MAX)).ok, true);
assert.equal(validateUsername("ab_cde").reason, "bad_chars", "no underscore");
assert.equal(validateUsername("иван12345").reason, "bad_chars", "latin only");
assert.equal(validateUsername("ivan.petrov").reason, "bad_chars");
assert.equal(validateUsername("12345abc").reason, "bad_start", "must start with a letter");
assert.equal(validateUsername("admin").reason, "reserved");
assert.equal(validateUsername("NOVA12").ok, true, "a reserved word with digits is a different name");
assert.equal(validateUsername("Nova").reason, "too_short");
assert.equal(validateUsername("openabundance").reason, "reserved");
assert.equal(validateUsername(undefined).ok, false);
assert.equal(normalizeUsernameInput("  @@Name "), "name");
assert.ok(USERNAME_MIN === 5);

// --- Transliteration and base ---
assert.equal(transliterate("Иван Петров"), "ivanpetrov");
assert.equal(transliterate("Щукин Ёжик"), "shchukinezhik");
assert.equal(transliterate("José Müller"), "josemuller");
assert.equal(usernameBase({ firstName: "Иван", lastName: "Петров" }), "ivanpetrov");
assert.equal(usernameBase({ displayName: "Anna Kovalenko-Smirnova-Long" }).length, 16, "base is cut to 16");
assert.equal(usernameBase({ displayName: "123abc" }), "abc", "leading digits are dropped");
assert.equal(usernameBase({}), "");

// --- An email is never a source, not even its local part ---
assert.equal(usernameBase({ displayName: "ivan.petrov84@example.com" }), "", "a display name with @ is ignored");
assert.equal(usernameBase({ firstName: "ivan@example.com", lastName: "Petrov" }), "petrov", "a name part with @ is ignored");
assert.equal(looksLikeEmail("a@b.c"), true);
assert.equal(looksLikeEmail("Ivan"), false);

// --- Candidates ---
const sequence = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
let index = 0;
const random = () => sequence[index++ % sequence.length];
const candidates = usernameCandidates("ivanpetrov", random);
assert.equal(candidates[0], "ivanpetrov", "the plain base is tried first");
assert.ok(candidates.length > 8);
assert.equal(new Set(candidates).size, candidates.length, "no duplicates");
for (const candidate of candidates) assert.equal(validateUsername(candidate).ok, true, candidate + " must be valid");
assert.ok(candidates.slice(1).every((value) => value.startsWith("ivanpetrov")), "later candidates add digits");

const fromShort = usernameCandidates("ab", random);
assert.ok(fromShort.length > 0 && fromShort.every((value) => value.length >= USERNAME_MIN), "a short base is lengthened with digits");
const fromNothing = usernameCandidates("", random);
assert.ok(fromNothing.every((value) => value.startsWith("user")) && fromNothing.length > 0, "no name gives user + digits");
const fromReserved = usernameCandidates("nova", random);
assert.ok(!fromReserved.includes("nova"), "a reserved plain base is skipped");
assert.ok(fromReserved.length > 0, "but digits make it usable");
const longRoot = usernameCandidates("a".repeat(16), random);
assert.ok(longRoot.every((value) => value.length <= USERNAME_MAX));

// --- The database and the application agree ---
const migration = read("supabase/migrations/20261011100000_usernames.sql");
for (const name of RESERVED_USERNAMES) assert.ok(migration.includes(`('${name}')`), `reserved word ${name} is missing from the migration`);
assert.match(migration, /\^\[a-z\]\[a-z0-9\]\{4,23\}\$/, "the database checks the same format");
assert.match(migration, /create unique index if not exists user_profiles_username_unique/);
assert.match(migration, /interval '30 days'/, "a released nickname is held for 30 days");
assert.match(migration, /interval '7 days'/, "changes are limited to one a week");
assert.match(migration, />= 3/, "and to three in 30 days");
for (const fn of ["username_status(text, uuid)", "claim_username(uuid, text, text)"]) {
  assert.ok(migration.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn + " must not be callable by clients");
  assert.ok(migration.includes(`grant execute on function public.${fn} to service_role`));
}

// --- No email as a visible name anywhere in the registration path ---
const claim = read("app/api/auth/claim/route.ts");
assert.doesNotMatch(claim, /user\.email/, "the registration route must not use the email");
assert.match(claim, /claimGeneratedUsername/);
assert.match(claim, /looksLikeEmail\(existingProfile\.display_name\)/, "an email-like stored name is replaced");
assert.doesNotMatch(claim, /username: textMetadata/, "sign-in must not overwrite the nickname");


// --- Showing people: name, then @nickname, never an email ---
assert.equal(personName({ display_name: "Anna Petrova", username: "annapetrova" }, "x"), "Anna Petrova");
assert.equal(personName({ display_name: null, username: "annapetrova" }, "x"), "@annapetrova");
assert.equal(personName({ display_name: "a@b.com", username: "annapetrova" }, "x"), "@annapetrova", "an email-like name is never shown");
assert.equal(personName({ display_name: "a@b.com", username: null }, "fallback"), "fallback");
assert.equal(personName(null, "fallback"), "fallback");
assert.equal(personLabel({ display_name: "Anna Petrova", username: "annapetrova" }, "x"), "Anna Petrova (@annapetrova)");
assert.equal(personLabel({ display_name: null, username: "annapetrova" }, "x"), "@annapetrova", "no duplicate when the name is the handle");
assert.equal(personHandle({ username: null }), "");

// --- Search ranking: exact nickname, then prefix, then contains ---
assert.equal(usernameMatchRank({ username: "ivan4821" }, "ivan4821"), 3);
assert.equal(usernameMatchRank({ username: "ivan4821" }, "@IVAN"), 2);
assert.equal(usernameMatchRank({ username: "ivan4821" }, "van4"), 1);
assert.equal(usernameMatchRank({ username: "ivan4821" }, "petrov"), 0);
assert.equal(usernameMatchRank({ username: null }, "ivan"), 0);

// --- Short links and referral alias ---
const config = read("next.config.mjs");
assert.match(config, /source: "\/@:username"/, "/@nickname is rewritten to the redirect route");
const redirect = read("app/u/by-username/[username]/route.ts");
assert.match(redirect, /NextResponse\.redirect\(.*307\)/, "the short link uses a temporary redirect");
assert.match(redirect, /username_changes/, "a nickname released in the last 30 days still leads to its owner");
assert.match(redirect, /30 \* 24 \* 60 \* 60_000/);
const referral = read("app/api/referrals/claim/route.ts");
assert.match(referral, /startsWith\("@"\)/, "?ref=@nickname is accepted");
assert.match(referral, /resolveNicknameReferral/);

// --- No email used as a name in the interface ---
for (const file of ["components/SocialApp.tsx", "components/ChallengesApp.tsx", "components/PublicUserPage.tsx", "components/BlogWorkspace.tsx"]) {
  assert.doesNotMatch(read(file), /\?\? *user\?\.email|\|\| *user\?\.email/, file + " must not fall back to the email");
}

console.log("username contract ok");
