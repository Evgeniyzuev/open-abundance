import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const module = { exports: {} };
const source = readFileSync("lib/uuid.ts", "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInThisContext(`(function(module,exports){${code}\n})`, { filename: "lib/uuid.ts" })(module, module.exports);
const { isUuid, normalizeUuid } = module.exports;

const validUuid = "b9100000-0000-4000-8000-000000000004";

assert.equal(isUuid(validUuid), true);
assert.equal(normalizeUuid(validUuid), validUuid);
assert.equal(isUuid("b9100000-0000-4000-8000000000000004"), false);
assert.equal(isUuid("b9100000-0000-6000-8000-000000000004"), false);
assert.equal(normalizeUuid(null), null);

console.log("UUID contract: canonical UUIDs pass and malformed values are rejected.");
