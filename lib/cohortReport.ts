// Weekly newcomer groups for growth experiments (Evgen, 2026-11-10): every week's newcomers get one changed
// element (ad hook, first screen, first task), tagged in the link with ?cohort=... or utm_campaign. This report
// compares the groups so the better variant gets more traffic. Groups smaller than `minGroup` are merged into
// "other" within their week so a single person cannot be recognised.
const DAY_MS = 86_400_000;

export type CohortPerson = {
  id: string;
  registeredAt: string;
  wishes: number;
  challengesCompleted: number;
  returnedDay2: boolean | null;
  referralsInvited: number;
  outcomeAnswers: string[];
};

export type CohortRow = {
  week: string;
  variant: string;
  people: number;
  addedWish: number;
  threeQuests: number;
  day2Eligible: number;
  day2Returned: number;
  invited: number;
  answeredOutcome: number;
};

function weekOf(iso: string): string {
  const date = new Date(Date.parse(iso));
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - day * DAY_MS).toISOString().slice(0, 10);
}

/** The variant label of a registration: the explicit cohort, else the campaign, else the source. */
export function variantOf(properties: Record<string, unknown> | null | undefined): string {
  const pick = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : null);
  return pick(properties?.cohort_id) ?? pick(properties?.campaign) ?? pick(properties?.acquisition_source) ?? "direct";
}

export function buildCohortReport(input: { people: CohortPerson[]; variants: Map<string, string>; now: number; weeks?: number; minGroup?: number }): CohortRow[] {
  const weeks = input.weeks ?? 6;
  const minGroup = input.minGroup ?? 5;
  const oldest = weekOf(new Date(input.now - (weeks - 1) * 7 * DAY_MS).toISOString());
  const byWeek = new Map<string, Map<string, CohortPerson[]>>();
  for (const person of input.people) {
    if (!Number.isFinite(Date.parse(person.registeredAt))) continue;
    const week = weekOf(person.registeredAt);
    if (week < oldest) continue;
    const variant = input.variants.get(person.id) ?? "direct";
    const groups = byWeek.get(week) ?? new Map<string, CohortPerson[]>();
    groups.set(variant, [...(groups.get(variant) ?? []), person]);
    byWeek.set(week, groups);
  }

  const rows: CohortRow[] = [];
  for (const [week, groups] of [...byWeek.entries()].sort((left, right) => right[0].localeCompare(left[0]))) {
    const merged = new Map<string, CohortPerson[]>();
    for (const [variant, people] of groups) {
      const key = people.length >= minGroup ? variant : "другое";
      merged.set(key, [...(merged.get(key) ?? []), ...people]);
    }
    for (const [variant, people] of [...merged.entries()].sort((left, right) => right[1].length - left[1].length)) {
      const eligible = people.filter((person) => person.returnedDay2 !== null);
      rows.push({
        week,
        variant,
        people: people.length,
        addedWish: people.filter((person) => person.wishes > 0).length,
        threeQuests: people.filter((person) => person.challengesCompleted >= 3).length,
        day2Eligible: eligible.length,
        day2Returned: eligible.filter((person) => person.returnedDay2).length,
        invited: people.filter((person) => person.referralsInvited > 0).length,
        answeredOutcome: people.filter((person) => person.outcomeAnswers.length > 0).length
      });
    }
  }
  return rows;
}

/** The best variant of the latest week that has at least two comparable groups, by day-2 return. */
export function bestVariant(rows: CohortRow[]): { week: string; variant: string; rate: number } | null {
  const weeks = [...new Set(rows.map((row) => row.week))];
  for (const week of weeks) {
    const comparable = rows.filter((row) => row.week === week && row.variant !== "другое" && row.day2Eligible >= 5);
    if (comparable.length < 2) continue;
    const top = comparable.map((row) => ({ week, variant: row.variant, rate: row.day2Returned / row.day2Eligible })).sort((left, right) => right.rate - left.rate)[0];
    return top;
  }
  return null;
}
