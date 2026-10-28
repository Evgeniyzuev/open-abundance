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

// Meetings with the lead: the person's rhythm, back-off after two unanswered invitations, Monday only then.
const { isMeetingDay, isMeetingDue, nextMeetingDay, shouldInviteToMeeting, meetingInviteCopy, meetingChatPrompt } = await import("../lib/leadMeetings.ts");
const { chooseNudge } = await import("../lib/coordinatorNextStep.ts");
const tue = Date.parse("2026-10-27T12:00:00Z");
const wed = Date.parse("2026-10-28T12:00:00Z");
const nextMon = Date.parse("2026-11-02T12:00:00Z");
assert.ok(isMeetingDay("daily", tue) && !isMeetingDay("three", tue) && isMeetingDay("three", wed) && !isMeetingDay("weekly", wed));
assert.ok(!isMeetingDue("daily", "2026-10-27", tue), "already met today");
assert.ok(!isMeetingDue("off", null, tue) && !isMeetingDue(null, null, tue));
assert.equal(nextMeetingDay("three", tue), "2026-10-28");
assert.equal(nextMeetingDay("weekly", tue), "2026-11-02");
const meet = { rhythm: "daily", lastMeetingDay: "2026-10-20", motive: "income", lastGoal: "Позвонить клиенту" };
assert.ok(shouldInviteToMeeting(meet, [], Date.parse("2026-10-20T10:00:00Z"), tue));
assert.ok(!shouldInviteToMeeting(meet, [{ step: "lead_meeting", at: tue - 3_600_000 }], null, tue), "once a day");
const twoMissed = [{ step: "lead_meeting", at: tue - 2 * 86_400_000 }, { step: "lead_meeting", at: tue - 86_400_000 }];
assert.ok(!shouldInviteToMeeting(meet, twoMissed, Date.parse("2026-10-20T10:00:00Z"), tue), "backs off after two unanswered");
assert.ok(shouldInviteToMeeting({ ...meet, lastMeetingDay: "2026-10-20" }, twoMissed, Date.parse("2026-10-20T10:00:00Z"), nextMon), "still invites on Monday");
assert.ok(meetingInviteCopy(meet).ru.body.includes("Позвонить клиенту") && meetingInviteCopy(meet).ru.body.includes("доход"));
assert.ok(meetingChatPrompt({ progress: ["Первый шаг"], lastGoal: "x", status: "done", question: "Как?", nextGoal: "y" }, "ru").includes("Мой вопрос: Как?"));

const participant = { id: "11111111-1111-4111-8111-111111111111", registeredAt: "2026-10-01T00:00:00Z", coreBalance: 0, lastActiveAt: null };
const step = chooseNudge(participant, { sends: [] }, { tasks: null, lastActiveAt: tue - 3_600_000, quest: null, meeting: { ...meet, lastMeetingAt: null } }, tue);
assert.equal(step?.key, "lead_meeting", "the meeting invitation comes first on a meeting day");
const migration2 = readFileSync(new URL("../supabase/migrations/20261027200000_lead_meetings.sql", import.meta.url), "utf8");
assert.ok(migration2.includes("unique (user_id, meeting_day)"));
console.log("lead meetings contract ok");

// The lead proposes the rhythm; a meeting stays open until the next meeting day; "price of your word".
const { suggestMeetingRhythm, currentMeetingDay } = await import("../lib/leadMeetings.ts");
assert.equal(suggestMeetingRhythm({ motive: null, questsLast7: 4 }).rhythm, "daily");
assert.equal(suggestMeetingRhythm({ motive: "income", questsLast7: 0 }).rhythm, "three");
assert.equal(suggestMeetingRhythm({ motive: null, questsLast7: 0 }).rhythm, "weekly");
assert.equal(currentMeetingDay("three", tue), "2026-10-26");
assert.ok(isMeetingDue("three", "2026-10-23", tue), "Monday's meeting can be answered on Tuesday");
assert.ok(!isMeetingDue("three", "2026-10-26", tue), "met on Monday, nothing due on Tuesday");
assert.ok(!shouldInviteToMeeting({ ...meet, rhythm: "three", lastMeetingDay: "2026-10-23" }, [], null, tue), "no invitation on a non-meeting day");
assert.ok(meetingInviteCopy(meet).ru.body.includes("когда будет время"));
const { pledgeBonus, pledgeDeadline, affordableAmounts } = await import("../lib/wordPledge.ts");
assert.equal(pledgeBonus(5, 10), 0.5);
const valueSql = readFileSync(new URL("../supabase/migrations/20261028120000_word_pledge_value_bonus.sql", import.meta.url), "utf8");
assert.ok(valueSql.includes("v_share <= 0") && valueSql.includes("word_pledges_user_challenge_once_idx"), "no word on onboarding steps, one word per quest ever");
assert.ok(valueSql.includes("v_floor + greatest(v_pool, 0)") && valueSql.includes("amount_cap"), "bonus above the floor comes from missed deposits; deposit capped by quest value");
assert.deepEqual(affordableAmounts(4), [1, 3]);
assert.deepEqual(affordableAmounts(50, 10), [1, 3, 5, 10], "deposit capped by the quest");
assert.equal(pledgeDeadline("2026-10-28", tue), "2026-10-28T23:59:00.000Z");
assert.equal(pledgeDeadline("2026-10-27", Date.parse("2026-10-27T20:00:00Z")), "2026-10-28T20:00:00.000Z", "at least 12 hours ahead");
const pledgeSql = readFileSync(new URL("../supabase/migrations/20261028090000_word_pledges.sql", import.meta.url), "utf8");
assert.ok(pledgeSql.includes("uc.status = 'completed'") && pledgeSql.includes("v_done <= v_pledge.deadline_at"), "kept only when the quest is completed in time");
assert.ok(pledgeSql.includes("round(p_amount, 2), 10, p_deadline_at"), "bonus is fixed in the database, not by the client");
console.log("word pledge contract ok");
