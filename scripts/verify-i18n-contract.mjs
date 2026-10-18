// Deterministic i18n checks: registry, dictionary parity, placeholders, fallback rules.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const registry = read("lib/locales.ts");
const i18n = read("lib/i18n.ts");

const entries = [...registry.matchAll(/\{ code: "([^"]+)", nativeName: "[^"]+", intl: "([^"]+)", dir: "(ltr|rtl)", complete: (true|false) \}/g)]
  .map((m) => ({ code: m[1], intl: m[2], dir: m[3], complete: m[4] === "true" }));
assert.ok(entries.length >= 2, "registry lists languages");
assert.equal(entries[0].code, "en", "English is the base language and comes first");
assert.ok(entries[0].complete, "English is complete");
assert.match(registry, /DEFAULT_LOCALE: AppLocale = "en"/, "default language is English");

const parseKeys = (text) => new Map([...text.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => [m[1], m[2]]));
const placeholders = (value) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);
const en = parseKeys(read("lib/messages/en.ts"));
assert.ok(en.size > 2000, "English dictionary is parsed");

for (const entry of entries) {
  assert.ok(i18n.includes(`${entry.code}: () => import("@/lib/messages/${entry.code}")`), `${entry.code} has a loader`);
  assert.ok(existsSync(new URL(`lib/messages/${entry.code}.ts`, root)), `${entry.code} dictionary exists`);
  if (entry.code === "en") continue;
  const dictionary = parseKeys(read(`lib/messages/${entry.code}.ts`));
  const extra = [...dictionary.keys()].filter((key) => !en.has(key));
  assert.deepEqual(extra, [], `${entry.code} has no keys absent from English: ${extra.slice(0, 5)}`);
  if (entry.complete) {
    const missing = [...en.keys()].filter((key) => !dictionary.has(key));
    assert.deepEqual(missing, [], `${entry.code} is marked complete but misses keys: ${missing.slice(0, 5)}`);
  }
  for (const [key, value] of dictionary) {
    if (en.get(key).trim()) assert.ok(value.trim().length > 0, `${entry.code}/${key} is not empty`);
    // A translation may use extra values the caller already passes, but must not drop any English one.
    const have = new Set(placeholders(value));
    const dropped = placeholders(en.get(key)).filter((name) => !have.has(name));
    assert.deepEqual(dropped, [], `${entry.code}/${key} drops {placeholders} used by English: ${dropped}`);
  }
}

// Fallback: partial languages load English next to their own dictionary; translate() ends on English, then the key.
assert.ok(i18n.includes("dictionaries[locale]?.[key] ?? dictionaries.en?.[key] ?? key"), "translate falls back to English then the key");
assert.ok(i18n.includes("needsEnglishFallback(locale)"), "partial languages load English as well");

// The server accepts any registered language, and the provider sets lang and dir.
assert.ok(read("app/api/user/locale/route.ts").includes("!isAppLocale(locale)"), "locale API validates against the registry");
assert.ok(read("components/UserProvider.tsx").includes("localeDirection(locale)"), "provider sets text direction");

// Onboarding choice continues into the app: registered languages carry over, zh/hi fall back to English.
const onboarding = read("lib/onboardingContent.ts");
assert.ok(onboarding.includes("isAppLocale(locale) ? locale : DEFAULT_LOCALE"), "onboarding-only languages fall back to English");
assert.ok(onboarding.includes("onboardingToAppLocale(normalizeOnboardingLocale(storedLocale))"), "registration locale follows the onboarding choice");
assert.ok(i18n.includes("openAbundanceOnboardingLocale") && i18n.includes("isAppLocale(onboardingLocale)"), "guests continue in the onboarding language");

// New code must use AppLocale, not a hand-written language union.
const literalUnion = '"ru" | "en"';
let offenders = [];
try {
  offenders = execFileSync("git", ["grep", "-lF", literalUnion, "--", "app", "components", "lib"], { cwd: root, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  // git grep exits 1 when nothing matches.
}
assert.deepEqual(offenders, [], "use AppLocale instead of the literal union");

// Right-to-left: Arabic is registered as rtl, and styles use logical properties (centering with left: 50% is the only allowed physical offset).
assert.ok(entries.some((entry) => entry.dir === "rtl"), "an RTL language is registered");
assert.ok(i18n.includes("u2068") && i18n.includes('localeDirection(locale) === "rtl"'), "values inserted into RTL text are bidi-isolated");
const cssFiles = execFileSync("git", ["ls-files", "app/styles", "components/*.module.css"], { cwd: root, encoding: "utf8" }).split("\n").filter((file) => file.endsWith(".css"));
const physical = /(^|[\s;{])(margin-left|margin-right|padding-left|padding-right|border-left|border-right|text-align:\s*(left|right)|float:\s*(left|right)|(left|right)\s*:(?!\s*50%|\s*calc\(50%))/;
const physicalOffenders = cssFiles.flatMap((file) => read(file).split("\n").map((line, index) => [file, index + 1, line]).filter(([, , line]) => physical.test(line)).map(([f, n]) => `${f}:${n}`));
const doubleColon = cssFiles.flatMap((file) => read(file).split("\n").map((line, index) => [file, index + 1, line]).filter(([, , line]) => /[a-z]::\s/.test(line)).map(([f, n]) => `${f}:${n}`));
assert.deepEqual(doubleColon, [], `CSS declaration with a doubled colon: ${doubleColon.slice(0, 5)}`);
assert.deepEqual(physicalOffenders, [], `use logical CSS properties: ${physicalOffenders.slice(0, 5)}`);

console.log(`i18n contract passed (${entries.map((e) => e.code).join(", ")}; ${en.size} keys)`);
