import assert from "node:assert/strict";
import { isSystemFeedPost } from "../lib/socialFeed.ts";

const template = { metadata: { origin: "system_template", templateKey: "daily_progress" } };
const upload = { metadata: { origin: "r2" } };

// Auto posts with the standard picture (or none) go to the "System" feed.
assert.equal(isSystemFeedPost("daily_progress", [template]), true);
assert.equal(isSystemFeedPost("level_up", []), true);
// Once the author puts their own picture on it, it is their post: main feed.
assert.equal(isSystemFeedPost("daily_progress", [upload]), false);
assert.equal(isSystemFeedPost("challenge", [template, { metadata: { origin: "user_upload" } }]), false);
assert.equal(isSystemFeedPost("wish_completed", [{ metadata: null }]), false);
// Posts people write themselves always stay in the main feed.
assert.equal(isSystemFeedPost("manual", []), false);
assert.equal(isSystemFeedPost("external_link", [template]), false);

console.log("system feed contract ok");
