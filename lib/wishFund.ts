// The open wish fund behind «Желания недели» (Evgen, 2026-11-10). Pure helpers shared by the internal API,
// the public page /fund and the contract test. Every row counts in the totals; details (title, what the person
// did, the result) are shown only for rows the person agreed to make public.
export const FUND_IN_KINDS = ["founder", "patron"] as const;
export const FUND_OUT_KINDS = ["help", "habit", "money"] as const;
export type FundKind = (typeof FUND_IN_KINDS)[number] | (typeof FUND_OUT_KINDS)[number];

export type FundRow = {
  id: string;
  direction: "in" | "out";
  kind: FundKind;
  amount: number;
  week_start: string;
  title: string;
  person_did: string;
  result: string;
  is_public: boolean;
  created_at: string;
};

export type FundEntryInput = {
  direction: "in" | "out";
  kind: FundKind;
  amount: number;
  title: string;
  personDid: string;
  result: string;
  isPublic: boolean;
  userId: string | null;
  wishId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Validates a new ledger row. Returns an error message instead of the row when something is off. */
export function parseFundEntry(payload: Record<string, unknown> | null): FundEntryInput | string {
  if (!payload) return "JSON body is required.";
  const kind = String(payload.kind ?? "") as FundKind;
  const isIn = (FUND_IN_KINDS as readonly string[]).includes(kind);
  const isOut = (FUND_OUT_KINDS as readonly string[]).includes(kind);
  if (!isIn && !isOut) return `kind: one of ${[...FUND_IN_KINDS, ...FUND_OUT_KINDS].join(", ")}.`;
  const amount = Math.round(Number(payload.amount ?? 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) return "amount: 0 to 100000.";
  if (isIn && amount <= 0) return "A contribution needs an amount above zero.";
  if (kind === "money" && amount <= 0) return "A money wish needs an amount above zero.";
  const title = text(payload.title, 160);
  if (isOut && !title) return "title: what was fulfilled.";
  const optionalId = (value: unknown) => (typeof value === "string" && UUID.test(value) ? value : null);
  return {
    direction: isIn ? "in" : "out",
    kind,
    amount,
    title,
    personDid: text(payload.personDid, 400),
    result: text(payload.result, 600),
    isPublic: payload.isPublic === true,
    userId: optionalId(payload.userId),
    wishId: optionalId(payload.wishId)
  };
}

export type FundSummary = {
  received: number;
  spent: number;
  balance: number;
  fulfilled: number;
  fulfilledWithoutMoney: number;
  contributors: number;
  weeks: Array<{ weekStart: string; fulfilled: number; spent: number; entries: FundPublicEntry[]; hidden: number }>;
};
export type FundPublicEntry = { id: string; kind: FundKind; amount: number; title: string; personDid: string; result: string };

/** Totals over every row, and per-week lists where only public rows carry details. */
export function summarizeFund(rows: FundRow[]): FundSummary {
  const round = (value: number) => Math.round(value * 100) / 100;
  const incoming = rows.filter((row) => row.direction === "in");
  const outgoing = rows.filter((row) => row.direction === "out");
  const received = round(incoming.reduce((sum, row) => sum + Number(row.amount), 0));
  const spent = round(outgoing.reduce((sum, row) => sum + Number(row.amount), 0));
  const byWeek = new Map<string, FundRow[]>();
  for (const row of outgoing) byWeek.set(row.week_start, [...(byWeek.get(row.week_start) ?? []), row]);
  return {
    received,
    spent,
    balance: round(received - spent),
    fulfilled: outgoing.length,
    fulfilledWithoutMoney: outgoing.filter((row) => Number(row.amount) === 0).length,
    contributors: incoming.length,
    weeks: [...byWeek.entries()].sort((left, right) => right[0].localeCompare(left[0])).map(([weekStart, items]) => ({
      weekStart,
      fulfilled: items.length,
      spent: round(items.reduce((sum, row) => sum + Number(row.amount), 0)),
      hidden: items.filter((row) => !row.is_public).length,
      entries: items.filter((row) => row.is_public).map((row) => ({ id: row.id, kind: row.kind, amount: Number(row.amount), title: row.title, personDid: row.person_did, result: row.result }))
    }))
  };
}
