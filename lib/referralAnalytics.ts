// The "Referrals" section of the daily analytics (docs/REFERRAL_PROGRAM_V2.md): the funnel from the invite quest to
// confirmed people, which ways of sending work, what people say would help them invite, the money paid, and
// proposals for the founder when invitations are low. Pure and relative-import only, like lib/dailyAnalytics.ts.

type Row = Record<string, any>;
const DAY_MS = 86_400_000;

export type ReferralProposal = { title: string; why: string };

export type ReferralReport = {
  funnel: Array<{ stage: string; people: number }>;
  shares: Array<{ via: string; people: number; times: number }>;
  help: Array<{ answer: string; people: number }>;
  paid: { core: number; wallet: number; byKind: Array<{ kind: string; core: number; wallet: number; count: number }> };
  invitations: { total: number; window: number; active: number; confirmed: number; inviters: number };
  proposals: ReferralProposal[];
  metrics: Record<string, number>;
};

const HELP_LABELS: Record<string, string> = {
  texts: "больше готовых текстов",
  video: "видео или картинка",
  bigger_bonus: "бонус побольше",
  clearer: "проще объяснить",
  who_to_invite: "не знает, кого звать",
  shy: "неловко",
  no_time: "нет времени"
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function peopleOf(rows: Row[]): number {
  return new Set(rows.map((row) => row.user_id ?? row.anonymous_id).filter(Boolean)).size;
}

export function buildReferralReport(t: Record<string, Row[] | undefined>, options: { now: number; days?: number }): ReferralReport {
  const days = options.days ?? 7;
  const since = options.now - days * DAY_MS;
  const inWindow = (iso: unknown) => {
    const time = Date.parse(String(iso ?? ""));
    return Number.isFinite(time) && time >= since && time <= options.now;
  };

  const events = (t.product_events ?? []).filter((row) => inWindow(row.occurred_at));
  const named = (name: string) => events.filter((row) => row.event_name === name);
  const steps = named("invite_quest_step");
  const stepPeople = (step: string) => peopleOf(steps.filter((row) => row.properties?.step === step));
  const shareEvents = named("invite_shared");

  const edges = t.referral_edges ?? [];
  const rewards = t.referral_rewards ?? [];
  const humanity = new Map((t.humanity_verifications ?? []).map((row) => [row.user_id, num(row.humanity_level)]));
  const activeIds = new Set(rewards.filter((row) => row.kind === "active").map((row) => row.referral_user_id));
  const windowEdges = edges.filter((row) => inWindow(row.claimed_at));
  const invitations = {
    total: edges.length,
    window: windowEdges.length,
    active: edges.filter((row) => activeIds.has(row.referral_user_id)).length,
    confirmed: edges.filter((row) => (humanity.get(row.referral_user_id) ?? 0) >= 2).length,
    inviters: new Set(windowEdges.map((row) => row.referrer_user_id)).size
  };

  const funnel = [
    { stage: "открыли квест «Пригласи друга» (шаг 2+)", people: stepPeople("bonuses") },
    { stage: "дошли до «Рассылка»", people: stepPeople("send") },
    { stage: "поделились ссылкой (любым способом)", people: peopleOf(shareEvents) },
    { stage: "привели хотя бы одного (за окно)", people: invitations.inviters }
  ];

  const shareVia = new Map<string, Row[]>();
  for (const row of shareEvents) {
    const via = String(row.properties?.via ?? "other");
    shareVia.set(via, [...(shareVia.get(via) ?? []), row]);
  }
  const shares = [...shareVia.entries()].map(([via, rows]) => ({ via, people: peopleOf(rows), times: rows.length })).sort((a, b) => b.times - a.times);

  const helpCounts = new Map<string, Set<string>>();
  for (const row of named("invite_help_answer")) {
    for (const answer of String(row.properties?.answers ?? "").split(",").filter(Boolean)) {
      const set = helpCounts.get(answer) ?? new Set<string>();
      set.add(String(row.user_id ?? row.anonymous_id));
      helpCounts.set(answer, set);
    }
  }
  const help = [...helpCounts.entries()].map(([answer, set]) => ({ answer: HELP_LABELS[answer] ?? answer, key: answer, people: set.size })).sort((a, b) => b.people - a.people);

  const paidRows = rewards.filter((row) => inWindow(row.created_at));
  const kinds = new Map<string, { core: number; wallet: number; count: number }>();
  for (const row of paidRows) {
    const kind = String(row.kind).replace(/_wallet$/, "");
    const entry = kinds.get(kind) ?? { core: 0, wallet: 0, count: 0 };
    if (row.destination === "wallet") entry.wallet += num(row.amount);
    else {
      entry.core += num(row.amount);
      entry.count += 1;
    }
    kinds.set(kind, entry);
  }
  const byKind = [...kinds.entries()].map(([kind, value]) => ({ kind, ...value }));
  const paid = { core: byKind.reduce((sum, row) => sum + row.core, 0), wallet: byKind.reduce((sum, row) => sum + row.wallet, 0), byKind };

  const proposals: ReferralProposal[] = [];
  const opened = funnel[0].people;
  const sent = funnel[2].people;
  if (opened >= 5 && sent / opened < 0.3) {
    proposals.push({ title: "Мало кто доходит до отправки ссылки", why: `Квест открыли ${opened}, поделились ${sent}. Стоит упростить шаги или поставить кнопку «Поделиться» раньше.` });
  }
  if (sent >= 5 && invitations.inviters / sent < 0.2) {
    proposals.push({ title: "Ссылкой делятся, но регистраций почти нет", why: `Поделились ${sent}, привели кого-то ${invitations.inviters}. Проверить превью ссылки и первый экран для приглашённого.` });
  }
  if (invitations.window > 0 && invitations.active / Math.max(invitations.total, 1) < 0.3) {
    proposals.push({ title: "Приглашённые не делают первое задание", why: `Активных ${invitations.active} из ${invitations.total}. Можно попросить пригласивших помочь новичку с первым квестом (Нова напомнит).` });
  }
  const topHelp = help[0];
  if (topHelp && topHelp.people >= 3) {
    proposals.push({ title: `Чаще всего просят: ${topHelp.answer}`, why: `${topHelp.people} человек выбрали этот ответ в квесте. Сделать это следующим шагом программы.` });
  }
  if (opened < 5) {
    proposals.push({ title: "Квест «Пригласи друга» почти не открывают", why: `За ${days} дней шаг 2 открыли ${opened}. Можно напомнить о нём от Новы на второй день или показать на главной.` });
  }

  const metrics = {
    referral_quest_opened: opened,
    referral_shared_people: sent,
    referral_inviters_window: invitations.inviters,
    referral_active_total: invitations.active,
    referral_paid_core_window: Number(paid.core.toFixed(2)),
    referral_paid_wallet_window: Number(paid.wallet.toFixed(2))
  };

  return { funnel, shares, help: help.map(({ answer, people }) => ({ answer, people })), paid, invitations, proposals, metrics };
}
