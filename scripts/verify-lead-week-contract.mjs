import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTROL_PRACTICE, LEAD_PRACTICES, isLeadControl, kitMessage, kitPracticeFor, practiceKeyFor, weekPhase, weekStart } from "../lib/leadPractices.ts";
import { chooseQuestNudge } from "../lib/questNudges.ts";
import { buildLeadWeekReport } from "../lib/leadWeekAnalytics.ts";

// Weeks start on Monday UTC; phases: Mon-Tue goal, Wed-Thu mid-week, Fri-Sun result.
assert.equal(weekStart(Date.parse("2026-10-27T18:00:00Z")), "2026-10-26");
assert.equal(weekStart(Date.parse("2026-11-01T23:59:00Z")), "2026-10-26");
assert.equal(weekStart(Date.parse("2026-11-02T00:00:00Z")), "2026-11-02");
assert.equal(weekPhase(Date.parse("2026-10-27T10:00:00Z")), "goal");
assert.equal(weekPhase(Date.parse("2026-10-29T10:00:00Z")), "midweek");
assert.equal(weekPhase(Date.parse("2026-11-01T10:00:00Z")), "review");

// About one in ten is the control group; others rotate through the practices week by week.
const ids = Array.from({ length: 2000 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
const control = ids.filter(isLeadControl).length;
assert.ok(control > 120 && control < 280, `control share ${control}`);
const someone = ids.find((id) => !isLeadControl(id));
assert.notEqual(practiceKeyFor(someone, "2026-10-26"), practiceKeyFor(someone, "2026-11-02"), "practice rotates weekly");
assert.equal(practiceKeyFor(ids.find(isLeadControl), "2026-10-26"), CONTROL_PRACTICE);
assert.equal(new Set(LEAD_PRACTICES.map((practice) => practice.key)).size, LEAD_PRACTICES.length);
assert.equal(kitPracticeFor("2026-10-26").key, kitPracticeFor("2026-10-26").key);
assert.ok(kitMessage(kitPracticeFor("2026-10-26"), "ru").includes("Практика этой недели"));

// Nova asks for the weekly goal on Monday-Tuesday, once, only for people led by the Open Abundance lead without a goal.
const monday = Date.parse("2026-10-26T12:00:00Z");
const base = { catalog: [], rows: [], leaderRank: null, weekQuests: 0 };
assert.equal(chooseQuestNudge({ ...base, leadWeekGoalSet: false }, [], monday - 3_600_000, monday)?.key, "lead_week_goal");
assert.equal(chooseQuestNudge({ ...base, leadWeekGoalSet: true }, [], monday - 3_600_000, monday), null);
assert.equal(chooseQuestNudge({ ...base, leadWeekGoalSet: null }, [], monday - 3_600_000, monday), null, "live-led people are not asked");
assert.equal(chooseQuestNudge({ ...base, leadWeekGoalSet: false }, [{ step: "lead_week_goal", at: monday - 3_600_000 }], monday - 3_600_000, monday), null);
assert.equal(chooseQuestNudge({ ...base, leadWeekGoalSet: false }, [], monday, Date.parse("2026-10-29T12:00:00Z")), null, "not mid-week");
assert.equal(chooseQuestNudge({ ...base, leadWeekGoalSet: false }, [], monday - 3_600_000, monday)?.deepLink, "/?view=people.teams");

const report = buildLeadWeekReport({
  memberships: [{ member_user_id: "a", leader_user_id: null, is_active: true }, { member_user_id: "b", leader_user_id: "c", is_active: true }],
  checkins: [{ user_id: "a", week_start: "2026-10-26", practice_key: "woop", goal: "x", review_status: "done" }],
  userChallenges: [{ user_id: "a", status: "completed", updated_at: "2026-10-27T10:00:00Z" }],
  events: [],
  now: monday
});
assert.deepEqual([report.liveLed, report.oaLed, report.thisWeek.goals, report.thisWeek.goalsOaLed], [1, 1, 1, 1]);
assert.deepEqual(report.practices[0], { practice: "woop", weeks: 1, done: 1, partly: 0, medianQuests: 1 });

const migration = readFileSync(new URL("../supabase/migrations/20261027190000_lead_week_checkins.sql", import.meta.url), "utf8");
assert.ok(migration.includes("visibility = 'lead'"), "a lead sees only weeks shared with them");
console.log("lead week contract ok");
