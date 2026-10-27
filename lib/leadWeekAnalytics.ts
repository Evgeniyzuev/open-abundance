// The Open Abundance lead in the daily analytics: who is led by whom, how the weekly rhythm goes, and which practice
// gives more results than the control group (docs/SMALL_WISHES_AND_LEADS_PLAN.md, stage 5). Counts only.
import { CONTROL_PRACTICE, practiceByKey, weekStart } from "./leadPractices.ts";

type Row = Record<string, any>;
const DAY_MS = 86_400_000;

export type PracticeOutcome = { practice: string; weeks: number; done: number; partly: number; medianQuests: number };

export type LeadWeekReport = {
  liveLed: number;
  oaLed: number;
  thisWeek: { goals: number; goalsOaLed: number; midweek: number; reviews: number; done: number };
  practices: PracticeOutcome[];
  kitCopies7d: number;
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function buildLeadWeekReport(input: { memberships: Row[]; checkins: Row[]; userChallenges: Row[]; events: Row[]; now: number }): LeadWeekReport {
  const active = input.memberships.filter((row) => row.is_active);
  const oaLedIds = new Set(active.filter((row) => !row.leader_user_id).map((row) => row.member_user_id));
  const current = weekStart(input.now);
  const thisWeek = input.checkins.filter((row) => row.week_start === current && row.goal);

  // Quests completed by the person during the week of each check-in with a goal.
  const completions = input.userChallenges.filter((row) => String(row.status ?? "").toLowerCase() === "completed");
  const questsInWeek = (userId: string, start: string) => {
    const from = Date.parse(`${start}T00:00:00Z`);
    const to = from + 7 * DAY_MS;
    return completions.filter((row) => row.user_id === userId && Date.parse(row.updated_at) >= from && Date.parse(row.updated_at) < to).length;
  };
  const byPractice = new Map<string, Row[]>();
  for (const row of input.checkins) {
    if (!row.goal) continue;
    const list = byPractice.get(row.practice_key) ?? [];
    list.push(row);
    byPractice.set(row.practice_key, list);
  }
  const practices = [...byPractice.entries()].map(([practice, rows]) => ({
    practice,
    weeks: rows.length,
    done: rows.filter((row) => row.review_status === "done").length,
    partly: rows.filter((row) => row.review_status === "partly").length,
    medianQuests: median(rows.map((row) => questsInWeek(row.user_id, row.week_start)))
  })).sort((left, right) => right.weeks - left.weeks || left.practice.localeCompare(right.practice));

  return {
    liveLed: active.filter((row) => row.leader_user_id).length,
    oaLed: oaLedIds.size,
    thisWeek: {
      goals: thisWeek.length,
      goalsOaLed: thisWeek.filter((row) => oaLedIds.has(row.user_id)).length,
      midweek: thisWeek.filter((row) => row.midweek_status).length,
      reviews: thisWeek.filter((row) => row.review_status).length,
      done: thisWeek.filter((row) => row.review_status === "done").length
    },
    practices,
    kitCopies7d: input.events.filter((row) => row.event_name === "lead_kit_copied" && input.now - Date.parse(row.occurred_at) <= 7 * DAY_MS).length
  };
}

export function practiceLabel(key: string): string {
  if (key === CONTROL_PRACTICE) return "без практики (контроль)";
  return practiceByKey(key)?.title.ru ?? key;
}
