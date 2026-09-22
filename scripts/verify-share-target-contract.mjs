import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
assert.equal(manifest.share_target.action, "/?share-target=1");
assert.equal(manifest.share_target.method, "GET");
assert.deepEqual(manifest.share_target.params, { title: "title", text: "text", url: "url" });

const originalWindow = globalThis.window;
const storage = new Map();
let search = "?share-target=1&title=Quick%20note&text=Read%20this%20https%3A%2F%2Fexample.com%2Fpost";
globalThis.window = {
  location: { get search() { return search; }, pathname: "/", hash: "" },
  history: { state: null, replaceState(_state, _title, next) { search = new URL(next, "https://oa.test").search; } },
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
};

try {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync("components/ShareTargetBootstrap.tsx", "utf8"), {
    fileName: "components/ShareTargetBootstrap.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: "ShareTargetBootstrap.tsx" })(require, module, module.exports);
  const { captureShareTargetDraftFromLocation, readShareTargetDraft, selectShareTargetDraft, saveShareTargetDraft, SHARE_TARGET_DRAFT_STORAGE_KEY } = module.exports;

  const single = captureShareTargetDraftFromLocation();
  assert.equal(single.url, "https://example.com/post");
  assert.equal(single.title, "Quick note");
  assert.equal(single.text, "Read this");
  assert.deepEqual(readShareTargetDraft(), single);
  assert.equal(search, "", "The copied share payload is removed from the visible URL after local capture");

  const multiple = {
    title: "Compare",
    text: "First https://example.com/a then https://video.example/watch",
    url: "",
    candidates: ["https://example.com/a", "https://video.example/watch"],
    receivedAt: new Date().toISOString()
  };
  saveShareTargetDraft(multiple);
  const chosen = selectShareTargetDraft(multiple, "https://video.example/watch");
  assert.equal(chosen.url, "https://video.example/watch");
  assert.deepEqual(chosen.candidates, ["https://video.example/watch"]);
  assert.equal(chosen.text, "First https://example.com/a then");
  assert.equal(storage.has(SHARE_TARGET_DRAFT_STORAGE_KEY), true);
  console.log("Share target: manifest mapping, URL-in-text recovery, local draft and multi-link choice passed.");
} finally {
  globalThis.window = originalWindow;
}
