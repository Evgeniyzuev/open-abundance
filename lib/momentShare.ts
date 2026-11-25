// A shareable card for a key moment (mini path result, quest reward, chest, Nova's week): the person's own words on a
// 9:16 or 4:5 image plus their invitation link. The card never says «посчитано системой», because its text comes from
// the link; verified numbers stay on the reality-day card. Pure, so scripts/verify-moment-share-contract.mjs runs it.

export const MOMENT_KINDS = ["path", "quest", "chest", "week", "pledge", "mission"] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

const EYEBROW: Record<"ru" | "en", Record<MomentKind, string>> = {
  ru: { path: "Мой путь начался", quest: "Задание выполнено", chest: "Сундук открыт", week: "Моя неделя", pledge: "Даю слово", mission: "Миссия выполнена" },
  en: { path: "My path has begun", quest: "Quest done", chest: "Chest opened", week: "My week", pledge: "I give my word", mission: "Mission done" }
};

const FOOTER = { ru: "Пройди свой путь вместе с Новой", en: "Walk your own path with Nova" } as const;

export function momentKind(value: unknown): MomentKind {
  return MOMENT_KINDS.includes(value as MomentKind) ? (value as MomentKind) : "quest";
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export type MomentCard = { kind: MomentKind; eyebrow: string; title: string; line: string; footer: string; locale: "ru" | "en" };

export function buildMomentCard(input: { kind?: unknown; title?: unknown; line?: unknown; locale?: unknown }): MomentCard {
  const locale = input.locale === "ru" ? "ru" : "en";
  const kind = momentKind(input.kind);
  return {
    kind,
    locale,
    eyebrow: EYEBROW[locale][kind],
    title: clip(input.title, 80) || EYEBROW[locale][kind],
    line: clip(input.line, 140),
    footer: FOOTER[locale]
  };
}

/** The card image address for ShareKit; format post = 4:5, story = 9:16. */
export function momentImagePath(card: { kind: MomentKind; title: string; line?: string }, locale: string, format: "post" | "story"): string {
  const params = new URLSearchParams({ kind: card.kind, title: card.title.slice(0, 80), locale: locale === "ru" ? "ru" : "en", format });
  if (card.line) params.set("line", card.line.slice(0, 140));
  return `/api/share/moment?${params.toString()}`;
}

/** The invitation link with the moment as utm_campaign, so analytics can tell which moments bring people. */
export function momentInviteUrl(appUrl: string, kind: MomentKind): string {
  try {
    const url = new URL(appUrl);
    url.searchParams.set("utm_source", "moment");
    url.searchParams.set("utm_campaign", kind);
    return url.toString();
  } catch {
    return appUrl;
  }
}
