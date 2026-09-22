import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const module = { exports: {} };
const code = ts.transpileModule(readFileSync("lib/sharePreview.ts", "utf8"), {
  fileName: "lib/sharePreview.ts",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: "sharePreview.ts" })(require, module, module.exports);
const { isNonPublicAddress, normalizeLinkSource } = module.exports;

for (const address of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "192.0.2.1", "198.51.100.1", "203.0.113.2", "::", "::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "fec0::1", "2001:db8::1", "2002:7f00:1::1"]) {
  assert.equal(isNonPublicAddress(address), true, `${address} must not be fetched`);
}
for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
  assert.equal(isNonPublicAddress(address), false, `${address} is a public destination`);
}
for (const url of ["file:///etc/passwd", "http://user:pass@example.com/", "http://example.com:8080/"]) {
  assert.equal(normalizeLinkSource(url), null, `${url} must be rejected`);
}
assert.equal(normalizeLinkSource("https://example.com/path?campaign=hello&utm_source=oa")?.normalizedUrl, "https://example.com/path?campaign=hello");
console.log("Link preview security: private/reserved IP ranges, unsafe schemes, credentials and ports are rejected.");
