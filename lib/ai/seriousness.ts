// Pure helper (no imports, tested directly by node). A rough, free check of whether a question is
// serious enough to suggest a deeper, slower answer. It never switches anything on by itself.

const SERIOUS_PATTERNS: RegExp[] = [
  /стоит ли|вложи|вывести|вывод|инвест|кредит|долг|ипотек|рассчита|посчита|сценари|составь план|план на|сравни|что лучше|риск|налог|бюджет|стратег|как выбрать|разобраться/,
  /should i|invest|withdraw|calculate|scenario|compare|budget|strategy|risk|tax|plan for|which is better/,
  /\d[\d\s.,]*\s?(\$|usd|руб|₽|eur|€|долл)/
];

export function isSeriousQuestion(text: string | null | undefined): boolean {
  const value = (text ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value.length >= 350) return true;
  if ((value.match(/\?/g) ?? []).length >= 2) return true;
  return SERIOUS_PATTERNS.some((pattern) => pattern.test(value));
}
