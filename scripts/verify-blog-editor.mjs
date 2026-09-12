// Deterministic component-state test; native dialog/layout still require browser QA.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const slots = [];
let slot = 0;
let effects = [];
const hooks = {
  ...require("react"),
  useState(initial) {
    const index = slot++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  },
  useRef(initial) { return hooks.useState(() => ({ current: initial }))[0]; },
  useCallback(fn) { return fn; },
  useEffect(fn, dependencies) {
    const index = slot++;
    if (!slots[index] || dependencies.some((value, n) => value !== slots[index][n])) effects.push(fn);
    slots[index] = dependencies;
  }
};
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const localRequire = (name) => {
    if (name === "react") return hooks;
    if (name === "@/lib/supabaseClient") return { getBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-only" } } }) } }) };
    if (name.startsWith("@/")) { const base = name.slice(2); return load(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`); }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: path })(localRequire, module, module.exports);
  modules.set(path, module.exports); return module.exports;
}
const owner = "11111111-1111-4111-8111-111111111111";
const basePost = { author_user_id: owner, post_type: "manual", status: "draft", visibility: "public", body: "", created_at: "2026-09-12T10:00:00.000Z", deleted_at: null, media: [], statBlocks: [], externalLinks: [], wish: null };
let created = 0; let uploadFails = true; let publishFails = true; let requests = [];
let posts = [];
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
globalThis.window = { scrollY: 120, scrollTo() {}, confirm: () => true };
globalThis.fetch = async (url, init) => {
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  let payload; let status = 200;
  if (method === "GET") payload = { posts: [...posts], author: null, nextCursor: null };
  else if (url.endsWith("/media")) {
    if (uploadFails) { payload = { error: "UPLOAD FAILED" }; status = 500; }
    else payload = { media: { id: "media", sort_order: 0, media_type: "image", media_url: "/cover.png" } };
  } else if (method === "POST") {
    created += 1;
    const post = { ...basePost, ...JSON.parse(init.body), id: `00000000-0000-4000-8000-${String(created).padStart(12, "0")}` };
    posts.push(post); payload = { post };
  } else {
    const change = JSON.parse(init.body);
    if (change.action === "publish" && publishFails) { payload = { error: "PUBLISH FAILED" }; status = 500; }
    else { posts[0] = { ...posts[0], body: change.body, visibility: change.visibility, status: change.action === "publish" ? "published" : posts[0].status }; payload = { post: posts[0] }; }
  }
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
};

try {
  const Component = load("components/BlogWorkspace.tsx").default;
  const labels = {
    "social.blog.cabinet": "Кабинет", "social.blog.tab.posts": "Посты", "social.blog.tab.drafts": "Черновики",
    "social.blog.create": "Создать", "social.blog.addMaterial": "Добавить материал", "social.blog.editorTitle": "Редактор материала",
    "social.blog.addMaterialTitle": "Добавить материал", "social.blog.published": "Опубликовано", "social.feed.publish": "Опубликовать",
    "app.common.save": "Сохранить", "app.common.delete": "Удалить", "app.common.close": "Закрыть", "social.blog.saved": "Сохранено"
  };
  const props = { userId: owner, authorId: null, locale: "ru", active: true, refreshKey: "", openCabinetNonce: 0, t: (key) => labels[key] ?? key, onOpenPost() {}, onChanged() {} };
  let tree;
  function render() { slot = 0; effects = []; tree = Component(props); effects.forEach((fn) => fn()); }
  async function settle() { for (let n = 0; n < 8; n++) { await new Promise(setImmediate); render(); } }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((item) => nodes(item));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  const find = (predicate) => { const node = nodes().find(predicate); assert.ok(node, "Expected control exists"); return node; };
  const button = (text) => find((node) => node.type === "button" && node.props.children === text);
  const dialog = () => find((node) => node.type?.name === "EditorDialog");
  const textArea = () => find((node) => node.type === "textarea");
  const submit = () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  render(); await settle();
  assert.equal(find((node) => node.props?.role === "tab" && node.props.children === "Кабинет").props["aria-selected"], true);
  button("Добавить материал").props.onClick(); render();
  find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [new File(["image"], "material.png", { type: "image/png" })] }, currentTarget: { value: "material.png" } }); render();
  assert.equal(find((node) => node.type === "input" && node.props.type === "file").props.accept.includes("video/mp4"), true);
  assert.equal(dialog().props.title, "Редактор материала");
  dialog().props.onClose(); render();
  button("Создать").props.onClick(); render();
  textArea().props.onChange({ target: { value: "Мой несохранённый текст" } }); render();
  find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [new File(["image"], "test.png", { type: "image/png" })] } }); render();
  submit(); submit(); await settle();
  assert.equal(created, 1, "A repeated submit cannot create a second post");
  assert.equal(textArea().props.value, "Мой несохранённый текст");
  assert.equal(find((node) => node.props?.role === "alert").props.children, "UPLOAD FAILED");
  dialog().props.onClose(); render();
  find((node) => node.props?.className === "blog-draft-tile").props.onClick(); render();
  assert.equal(textArea().props.value, "Мой несохранённый текст", "Reopening a partially saved draft retains text");
  assert.equal(nodes().filter((node) => node.type?.name === "EditorDialog").length, 1);
  uploadFails = false; submit(); await settle();
  assert.equal(created, 1, "Retry reuses the created post id after upload failure");
  button("Опубликовать").props.onClick(); await settle();
  assert.equal(find((node) => node.props?.role === "alert").props.children, "PUBLISH FAILED");
  assert.equal(textArea().props.value, "Мой несохранённый текст");
  publishFails = false; button("Опубликовать").props.onClick(); await settle();
  assert.equal(nodes().some((node) => node.type?.name === "EditorDialog"), false);
  assert.equal(posts[0].status, "published");
  assert.equal(nodes().some((node) => node.props?.className === "blog-draft-tile"), false, "Published post leaves drafts");
  button("Создать").props.onClick(); render();
  assert.equal(textArea().props.value, "", "Create starts a new material after successful save");
  console.log("Blog editor: single editor, repeated submit, upload/publish failure, retained text and retry passed.");
} finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
