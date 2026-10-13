import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifySwipe, nextInSequence, SWIPE_MIN_DISTANCE } from "../lib/swipe.ts";

// Only clear horizontal swipes count; scrolling never triggers a signal.
assert.equal(classifySwipe(SWIPE_MIN_DISTANCE + 10, 5), "right");
assert.equal(classifySwipe(-(SWIPE_MIN_DISTANCE + 10), 5), "left");
assert.equal(classifySwipe(SWIPE_MIN_DISTANCE - 1, 0), null, "short drags are ignored");
assert.equal(classifySwipe(80, 70), null, "diagonal scroll is ignored");
assert.equal(classifySwipe(10, 300), null, "vertical scroll is ignored");

// The walk through stories is finite: no wrap-around, no auto-loading.
assert.equal(nextInSequence(0, 3, 1), 1);
assert.equal(nextInSequence(2, 3, 1), null, "the last story ends the selection");
assert.equal(nextInSequence(0, 3, -1), null);

const social = readFileSync("components/SocialApp.tsx", "utf8");
assert.match(social, /classifySwipe\(event\.clientX - start\.x, event\.clientY - start\.y\)/);
assert.match(social, /event\.pointerType === "mouse"/, "mouse drags (text selection) are not swipes");
assert.match(social, /recordFeedSwipeSignal\(currentUserId, post, direction === "right" \? "interest" : "not_for_me"\)/, "swipes use the same local signals as the buttons");
assert.match(social, /social\.feed\.sequenceEnd/, "the selection ends explicitly");
assert.match(social, /aria-label=\{t\("social\.feed\.nextStory"\)\}/, "buttons duplicate gestures");
assert.match(social, /isFeedTopicMuted\(feedSequence\[next\], preferences\)/, "muted topics are skipped immediately");
const signals = readFileSync("components/FeedPostSignals.tsx", "utf8");
assert.match(signals, /method: "swipe"/, "swipe events are distinguishable from button taps");
assert.doesNotMatch(social.slice(social.indexOf("function moveInFeedSequence"), social.indexOf("function moveInFeedSequence") + 900), /fetch\(|loadFeed\(/, "moving through stories does not request more data");

console.log("Feed swipe contract verified.");
