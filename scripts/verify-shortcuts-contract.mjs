import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuickAction } from "../lib/quickAction.ts";

assert.equal(parseQuickAction("?view=goals.checks&quick=new-task"), "new-task");
assert.equal(parseQuickAction("?quick=capture"), "capture");
assert.equal(parseQuickAction("?quick=brain-dump"), null, "the old brain dump shortcut is gone");
assert.equal(parseQuickAction("?quick=delete-everything"), null, "unknown actions are ignored");
assert.equal(parseQuickAction(""), null);

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3 && manifest.shortcuts.length <= 4, "a few shortcuts (Android shows up to four)");
for (const shortcut of manifest.shortcuts) {
  assert.ok(shortcut.name && shortcut.short_name && shortcut.url.startsWith("/?view="), `${shortcut.name} opens an app view`);
  const action = parseQuickAction(new URL(shortcut.url, "https://example.test").search);
  if (shortcut.url.includes("quick=")) assert.ok(action, `${shortcut.name} uses a known quick action`);
}
assert.equal(manifest.share_target?.action, "/?share-target=1", "the existing share target is kept");

assert.match(readFileSync("components/TasksApp.tsx", "utf8"), /takeQuickAction\("new-task"\)/);
const notes = readFileSync("components/NotesApp.tsx", "utf8");
assert.match(notes, /takeQuickAction\("capture"\)/);
assert.match(readFileSync("lib/quickAction.ts", "utf8"), /replaceState/, "a quick action runs once and leaves the address");

console.log("Shortcuts contract verified.");
