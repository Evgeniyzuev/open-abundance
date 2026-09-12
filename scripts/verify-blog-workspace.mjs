import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const owner = "11111111-1111-4111-8111-111111111111";
const visitor = "22222222-2222-4222-8222-222222222222";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const date = "2026-09-12T10:00:00.000Z";
const makePost = (n, fields = {}) => ({ id: id(n), author_user_id: owner, post_type: "manual", status: "draft", visibility: "private", body: `Post ${n}`, created_at: date, deleted_at: null, ...fields });
let viewer = owner;
let fixtures;
const queries = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; this.cap = Infinity; this.fields = "*"; queries.push(this); }
  select(fields) { this.fields = fields; return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  is(key, value) { return this.eq(key, value); }
  in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
  lt(key, value) { this.filters.push((row) => row[key] < value); return this; }
  order(key, options) { this.orders.push([key, options.ascending]); return this; }
  limit(cap) { this.cap = cap; return this; }
  or(expression) {
    const cursor = expression.match(/^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([\da-f-]+)\)$/);
    if (cursor) this.filters.push((row) => row.created_at < cursor[1] || row.created_at === cursor[2] && row.id < cursor[3]);
    else this.filters.push((row) => expression.split(",").some((part) => { const [key, op, ...value] = part.split("."); assert.equal(op, "eq"); return row[key] === value.join("."); }));
    return this;
  }
  maybeSingle() { this.single = true; return this; }
  then(resolve, reject) {
    try {
      let rows = (fixtures[this.table] ?? []).filter((row) => this.filters.every((test) => test(row)));
      rows = [...rows].sort((a, b) => { for (const [key, asc] of this.orders) { const comparison = String(a[key]).localeCompare(String(b[key])); if (comparison) return asc ? comparison : -comparison; } return 0; }).slice(0, this.cap);
      if (this.fields !== "*") rows = rows.map((row) => Object.fromEntries(this.fields.split(",").map((key) => [key, row[key]])));
      return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
    } catch (error) { return Promise.reject(error).then(resolve, reject); }
  }
}
const supabase = { from: (table) => new Query(table) };
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const module = { exports: {} };
  modules.set(path, module.exports);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = (name) => {
    if (name === "@/lib/serverSupabase") return { getAuthenticatedUser: async () => ({ supabase, user: viewer ? { id: viewer } : null, error: viewer ? null : "No session" }) };
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: path })(localRequire, module, module.exports);
  modules.set(path, module.exports); return module.exports;
}
const { GET } = load("app/api/social/feed/route.ts");
const { NextRequest } = require("next/server");
const { mergeBlogPosts, encodeBlogCursor, decodeBlogCursor, BLOG_PAGE_SIZE } = load("lib/blogWorkspace.ts");
async function get(params = {}) {
  const response = await GET(new NextRequest(`http://localhost/api/social/feed?${new URLSearchParams({ scope: "blog", authorUserId: owner, ...params })}`));
  return { status: response.status, body: await response.json() };
}

fixtures = {
  feed_posts: Array.from({ length: 40 }, (_, n) => makePost(n + 1, { post_type: n % 2 ? "manual" : "daily_progress" })),
  user_profiles: [{ user_id: owner, display_name: "Author", bio: "PRIVATE BIO" }],
  user_profile_visibility_settings: [{ user_id: owner, settings: { bio: "private" } }],
  user_profile_links: [{ id: "private", user_id: owner, visibility: "private", url: "https://private.example" }, { id: "public", user_id: owner, visibility: "public", url: "https://public.example", label: "Site" }]
};
let cursor; let all = []; let sizes = [];
do {
  const result = await get({ view: "cabinet", status: "draft", limit: String(BLOG_PAGE_SIZE), ...(cursor ? { cursor } : {}) });
  assert.equal(result.status, 200);
  sizes.push(result.body.posts.length); all = mergeBlogPosts(all, result.body.posts); cursor = result.body.nextCursor;
} while (cursor);
assert.deepEqual(sizes, [18, 18, 4]);
assert.equal(new Set(all.map((post) => post.id)).size, 40);
assert.equal(all[0].id, id(40));
assert.equal(mergeBlogPosts(all, [{ ...all[0], body: "Updated" }]).length, 40);
assert.equal(mergeBlogPosts(all, [{ ...all[0], body: "Updated" }])[0].body, "Updated");
assert.deepEqual(decodeBlogCursor(encodeBlogCursor(all[0])), { createdAt: date, id: id(40) });
assert.equal(decodeBlogCursor(`${date}|${id(40)},visibility.eq.public`), null);
assert.equal((await get({ view: "cabinet", cursor: "invalid" })).status, 400);

const publicPost = makePost(60, { status: "published", visibility: "public", snapshot_id: "private-snapshot" });
fixtures.feed_posts.push(publicPost, makePost(61, { status: "published" }), makePost(62, { status: "published", visibility: "public", deleted_at: date }));
fixtures.feed_post_stat_blocks = [{ id: "public-block", post_id: id(60), visibility: "public", value: 10 }, { id: "private-block", post_id: id(60), visibility: "private", value: "PRIVATE MONEY" }];
fixtures.feed_post_media = [{ id: "media", post_id: id(60), media_type: "image", media_url: "/public.png", metadata: { internal: "PRIVATE MEDIA METADATA" } }, { id: "private-media", post_id: id(61), media_url: "/private.png" }];
const ownPublic = await get({ view: "public" });
assert.equal(ownPublic.status, 200);
assert.deepEqual(ownPublic.body.posts.map((post) => post.id), [id(60)]);
assert.equal(ownPublic.body.posts[0].snapshot_id, null);
assert.deepEqual(ownPublic.body.posts[0].statBlocks.map((block) => block.id), ["public-block"]);
assert.equal(ownPublic.body.blogHeader.bio, null);
assert.equal(ownPublic.body.blogHeader.links.length, 1);
assert.doesNotMatch(JSON.stringify(ownPublic.body), /PRIVATE|private\.example|private\.png/);
assert.deepEqual((await get()).body, ownPublic.body, "Default blog is public even for its owner");
const published = await get({ view: "cabinet", status: "published" });
assert.deepEqual(published.body.posts.map((post) => post.id), [id(61), id(60)]);
assert.equal(published.body.posts.find((post) => post.id === id(60)).statBlocks.length, 2);
viewer = visitor;
assert.deepEqual((await get({ view: "public" })).body, ownPublic.body, "Owner preview and visitor share the same public payload");
assert.equal((await get({ view: "cabinet" })).status, 403);
assert.equal((await get({ drafts: "system" })).status, 403);
viewer = null;
assert.equal((await get({ view: "public" })).status, 401);
viewer = owner;
fixtures.feed_posts = [];
assert.equal((await get({ view: "public" })).body.author.display_name, "Author", "An empty blog still has its author header");
console.log("Blog workspace: pagination, deduplication, ownership and public projection passed.");
