// What people say along the quests (docs/QUEST_PATH_PLAN.md 11.4): ratings after each quest with reasons, reasons for
// "Skip", "How do you like the sum?" in "The power of Core", the first wish picked, and the day-3 question
// "What do you need to keep going?". Pure and relative-import only, like lib/dailyAnalytics.ts.

type Row = Record<string, any>;
const DAY_MS = 86_400_000;

export type QuestRatingRow = { quest: string; ratings: number; average: number; low: number; reasons: string };
export type QuestFeedbackReport = {
  ratings: QuestRatingRow[];
  skipReasons: Array<[string, number]>;
  corePowerReactions: Array<[string, number]>;
  firstWishes: Array<[string, number]>;
  continueAnswers: Array<[string, number]>;
  /** «Про изобилие»: share right on the first try per knowledge question, and the opinion answers per question. */
  abundance: { people: number; knowledge: Array<[string, string]>; opinions: Array<[string, Array<[string, number]>]> };
  proposals: Array<{ title: string; why: string }>;
  metrics: Record<string, number>;
};

function tally(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function split(value: unknown): string[] {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function buildQuestFeedbackReport(t: Record<string, Row[] | undefined>, options: { now: number; days?: number }): QuestFeedbackReport {
  const since = options.now - (options.days ?? 7) * DAY_MS;
  const events = (t.product_events ?? []).filter((row) => {
    const time = Date.parse(String(row.occurred_at ?? ""));
    return Number.isFinite(time) && time >= since && time <= options.now;
  });
  const named = (name: string) => events.filter((row) => row.event_name === name);
  const titles = new Map((t.challenges ?? []).map((row) => [row.id, typeof row.title === "object" ? row.title?.ru ?? row.title?.en ?? row.id : String(row.title ?? row.id)]));

  const byQuest = new Map<string, Row[]>();
  for (const row of named("quest_rated")) {
    const id = String(row.properties?.challenge_id ?? "");
    byQuest.set(id, [...(byQuest.get(id) ?? []), row]);
  }
  const ratings = [...byQuest.entries()].map(([id, rows]) => {
    const values = rows.map((row) => Number(row.properties?.rating)).filter((value) => value >= 1 && value <= 5);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      quest: titles.get(id) ?? id,
      ratings: values.length,
      average: Number(average.toFixed(1)),
      low: values.filter((value) => value <= 3).length,
      reasons: tally(rows.flatMap((row) => split(row.properties?.reasons))).slice(0, 3).map(([reason, count]) => `${reason} ${count}`).join(", ")
    };
  }).sort((a, b) => a.average - b.average);

  const skipReasons = tally(named("quest_skip_reason").map((row) => String(row.properties?.reason ?? "")));
  const corePowerReactions = tally(named("core_power_reaction").map((row) => String(row.properties?.reaction ?? "")));
  const firstWishes = tally(named("first_wish_chosen").map((row) => String(row.properties?.wish ?? "")));
  const continueAnswers = tally(named("quest_continue_answer").flatMap((row) => split(row.properties?.answers)));

  const quiz = named("abundance_quiz_answered");
  const prefixed = (prefix: string) => [...new Set(quiz.flatMap((row) => Object.keys(row.properties ?? {}).filter((key) => key.startsWith(prefix))))];
  const abundance = {
    people: quiz.length,
    knowledge: prefixed("k_").map((key) => {
      const right = quiz.filter((row) => row.properties?.[key] === true).length;
      return [key.slice(2), `${right} из ${quiz.length}`] as [string, string];
    }),
    opinions: prefixed("o_").map((key) => [key.slice(2), tally(quiz.map((row) => String(row.properties?.[key] ?? "")))] as [string, Array<[string, number]>])
  };

  const proposals: Array<{ title: string; why: string }> = [];
  const weakest = abundance.knowledge.map(([question, label]) => ({ question, right: Number(label.split(" ")[0]) })).sort((a, b) => a.right - b.right)[0];
  if (abundance.people >= 5 && weakest && weakest.right / abundance.people < 0.5) proposals.push({ title: `Люди не понимают «${weakest.question}»`, why: `С первой попытки верно ответили ${weakest.right} из ${abundance.people} в «Про изобилие». Стоит объяснить это в приложении понятнее.` });
  const worst = ratings.find((row) => row.ratings >= 3 && row.average < 3.5);
  if (worst) proposals.push({ title: `Переделать квест «${worst.quest}»`, why: `Средняя оценка ${worst.average} из 5 по ${worst.ratings} ответам${worst.reasons ? `, причины: ${worst.reasons}` : ""}.` });
  const [topSkip] = skipReasons;
  if (topSkip && topSkip[1] >= 3) proposals.push({ title: `Чаще всего пропускают с причиной «${topSkip[0]}»`, why: `${topSkip[1]} раз за неделю. Стоит упростить или объяснить текст квестов.` });
  const doubt = corePowerReactions.filter(([reaction]) => reaction === "unreal" || reaction === "nonsense").reduce((sum, [, count]) => sum + count, 0);
  const reactionsTotal = corePowerReactions.reduce((sum, [, count]) => sum + count, 0);
  if (reactionsTotal >= 5 && doubt / reactionsTotal > 0.4) proposals.push({ title: "Расчёт на 30 лет вызывает недоверие", why: `${doubt} из ${reactionsTotal} ответили «нереально» или «ерунда». Можно показывать 10 лет по умолчанию и объяснять ставку.` });
  const [topContinue] = continueAnswers;
  if (topContinue && topContinue[1] >= 3) proposals.push({ title: `Чтобы продолжать, просят: ${topContinue[0]}`, why: `${topContinue[1]} ответов на вопрос третьего дня.` });

  return {
    ratings,
    skipReasons,
    corePowerReactions,
    firstWishes,
    continueAnswers,
    abundance,
    proposals,
    metrics: {
      quest_ratings: ratings.reduce((sum, row) => sum + row.ratings, 0),
      quest_skips_with_reason: skipReasons.reduce((sum, [, count]) => sum + count, 0),
      quest_continue_answers: named("quest_continue_answer").length
    }
  };
}
