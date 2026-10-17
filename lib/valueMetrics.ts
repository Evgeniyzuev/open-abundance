// "Sessions with value" for the internal growth report (no imports, tested directly by node).
// A session is approximated as one person-day (UTC): a day with any app event counts as visited,
// and a visited day with at least one value event counts as a session with value. Passive
// viewing alone (opens, impressions) never counts as value.

/** Events that mean the person did, decided, saved or helped with something. No content is read. */
export const VALUE_EVENTS = [
  "daily_set_action",
  "daily_set_completed",
  "task_done",
  "task_steps_accepted",
  "brain_dump_created",
  "decision_task_added",
  "routine_plan_created",
  "week_review_loose_end",
  "week_recap_shared",
  "tasks_calendar_exported",
  "feed_interest",
  "feed_want_this",
  "feed_can_help",
  "feed_not_for_me",
  "wish_created",
  "growth_plan_saved",
  "challenge_accepted",
  "challenge_completed",
  "niche_task_chosen",
  "market_offer_prefilled",
  "reflection_captured",
  "feedback_submitted",
  "wish_outcome_answered",
  "wish_woop_saved",
  "task_next_hook_saved"
] as const;

/** Viewing without acting; many of these with no value event on the same day is a doomscroll signal. */
export const PASSIVE_EVENTS = ["app_open", "feed_post_impression", "feed_post_opened", "week_recap_opened", "growth_map_opened"] as const;

export const PASSIVE_ONLY_IMPRESSIONS = 20;

export type ValueEventRow = {
  user_id: string | null;
  anonymous_id?: string | null;
  event_name: string;
  occurred_at: string;
  properties?: unknown;
};

export type ValueMetrics = {
  personDays: number;
  valuePersonDays: number;
  valueRate: number | null;
  /** Person-days with many impressions and not a single value event. */
  passiveOnlyDays: number;
  passiveOnlyRate: number | null;
  people: number;
  peopleWithValue: number;
  dailySet: { peopleStarted: number; completions: number; averageActions: number | null; skips: number };
  helpedAnswers: Record<string, number>;
  topValueEvents: Array<{ event: string; count: number }>;
};

const VALUE_SET = new Set<string>(VALUE_EVENTS);

function personKey(row: ValueEventRow): string | null {
  return row.user_id ? `u:${row.user_id}` : row.anonymous_id ? `a:${row.anonymous_id}` : null;
}

function readProperty(properties: unknown, key: string): unknown {
  return properties && typeof properties === "object" && !Array.isArray(properties) ? (properties as Record<string, unknown>)[key] : undefined;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null;
}

export function computeValueMetrics(rows: ValueEventRow[]): ValueMetrics {
  const days = new Map<string, { value: number; impressions: number }>();
  const people = new Set<string>();
  const peopleWithValue = new Set<string>();
  const dailySetPeople = new Set<string>();
  const completionActions: number[] = [];
  const helpedAnswers: Record<string, number> = {};
  const valueCounts = new Map<string, number>();
  let skips = 0;

  for (const row of rows) {
    const person = personKey(row);
    if (!person) continue;
    people.add(person);
    const dayKey = `${person}|${row.occurred_at.slice(0, 10)}`;
    const day = days.get(dayKey) ?? { value: 0, impressions: 0 };
    if (VALUE_SET.has(row.event_name)) {
      day.value += 1;
      peopleWithValue.add(person);
      valueCounts.set(row.event_name, (valueCounts.get(row.event_name) ?? 0) + 1);
    }
    if (row.event_name === "feed_post_impression") day.impressions += 1;
    days.set(dayKey, day);

    if (row.event_name === "daily_set_action" || row.event_name === "daily_set_skipped") dailySetPeople.add(person);
    if (row.event_name === "daily_set_skipped") skips += 1;
    if (row.event_name === "daily_set_completed") {
      const actions = Number(readProperty(row.properties, "actions"));
      if (Number.isFinite(actions)) completionActions.push(actions);
    }
    if (row.event_name === "wish_outcome_answered") {
      const answer = readProperty(row.properties, "answer");
      const key = typeof answer === "string" ? answer : "unknown";
      helpedAnswers[key] = (helpedAnswers[key] ?? 0) + 1;
    }
  }

  const allDays = [...days.values()];
  const valuePersonDays = allDays.filter((day) => day.value > 0).length;
  const passiveOnlyDays = allDays.filter((day) => day.value === 0 && day.impressions >= PASSIVE_ONLY_IMPRESSIONS).length;

  return {
    personDays: allDays.length,
    valuePersonDays,
    valueRate: ratio(valuePersonDays, allDays.length),
    passiveOnlyDays,
    passiveOnlyRate: ratio(passiveOnlyDays, allDays.length),
    people: people.size,
    peopleWithValue: peopleWithValue.size,
    dailySet: {
      peopleStarted: dailySetPeople.size,
      completions: completionActions.length,
      averageActions: completionActions.length ? Math.round((completionActions.reduce((sum, value) => sum + value, 0) / completionActions.length) * 10) / 10 : null,
      skips
    },
    helpedAnswers,
    topValueEvents: [...valueCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([event, count]) => ({ event, count }))
  };
}
