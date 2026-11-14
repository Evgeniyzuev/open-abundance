// «Просьба через Нову» with double consent (Evgen, 2026-11-14). Pure rules shared by the API, the Home card and the
// contract test. People talk through Nova: a request goes out without a name, a helper says «Могу», the requester
// confirms, and only then they exchange messages, still without names. A name is shown only when both sides chose
// to show theirs. Either side can leave at any step without explaining; nobody is rated in public.
import { checkListingText } from "./marketplaceListingCheck.ts";

export const REQUEST_KINDS = ["advice", "help", "partner", "talk"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_MIN_CHARS = 3;
export const REQUEST_MAX_CHARS = 400;
export const MESSAGE_MAX_CHARS = 600;
/** Open or matched requests one person may have at once. */
export const MAX_ACTIVE_REQUESTS = 2;
/** New requests one person may create in 24 hours. */
export const MAX_REQUESTS_PER_DAY = 3;
/** People Nova asks directly about one request, and how many may answer «Могу». */
export const MAX_ASKED_HELPERS = 5;
/** Open requests of other people shown to one person. */
export const MAX_OPEN_SHOWN = 5;

export type RequestRow = {
  id: string;
  requester_user_id: string;
  kind: RequestKind;
  body: string;
  status: "open" | "matched" | "closed" | "cancelled";
  helper_user_id: string | null;
  requester_reveal: boolean;
  helper_reveal: boolean;
  helped: boolean | null;
  closed_by: "requester" | "helper" | null;
  created_at: string;
};
export type OfferRow = { id: string; request_id: string; helper_user_id: string; status: "asked" | "ready" | "passed" | "connected" | "released" };
export type MessageRow = { id: string; request_id: string; sender_user_id: string; body: string; created_at: string };

export type TextProblem = "length" | "contacts";

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "");

/** Contacts and links would break the anonymity before both sides agreed, so they are not passed on. */
export function hasContacts(text: string): boolean {
  const flags = checkListingText({ title: "", description: text });
  return flags.includes("contacts") || flags.includes("external_link");
}

export function parseRequestText(value: unknown): { text: string } | { problem: TextProblem } {
  const text = clean(value);
  if (text.length < REQUEST_MIN_CHARS || text.length > REQUEST_MAX_CHARS) return { problem: "length" };
  if (hasContacts(text)) return { problem: "contacts" };
  return { text };
}

/** A message inside a connection. Contacts are allowed only after both sides chose to show their names. */
export function parseMessageText(value: unknown, bothRevealed: boolean): { text: string } | { problem: TextProblem } {
  const text = clean(value);
  if (text.length < 1 || text.length > MESSAGE_MAX_CHARS) return { problem: "length" };
  if (!bothRevealed && hasContacts(text)) return { problem: "contacts" };
  return { text };
}

export function isRequestKind(value: unknown): value is RequestKind {
  return typeof value === "string" && (REQUEST_KINDS as readonly string[]).includes(value);
}

export type Role = "requester" | "helper" | "invited" | "none";

/** What the person is to this request: its author, its connected helper, someone who may answer, or nobody. */
export function roleFor(request: RequestRow, offer: OfferRow | null, userId: string): Role {
  if (request.requester_user_id === userId) return "requester";
  if (request.helper_user_id === userId && request.status !== "open") return "helper";
  if (request.status === "open" && offer?.status !== "released") return "invited";
  return "none";
}

export type RequestAction = "can" | "pass" | "answer" | "connect" | "message" | "reveal" | "close" | "cancel";

/** Whether the role may take the action in the request's state. */
export function canAct(action: RequestAction, role: Role, request: RequestRow, offer: OfferRow | null): boolean {
  switch (action) {
    case "can":
      return role === "invited" && offer?.status !== "ready";
    case "pass":
    case "answer":
      // One answer through Nova per person; the server checks that none was sent yet.
      return role === "invited";
    case "connect":
    case "cancel":
      return role === "requester" && request.status === "open";
    case "message":
    case "reveal":
      return (role === "requester" || role === "helper") && request.status === "matched";
    case "close":
      // The requester may also close an open request once answers through Nova were enough (the server checks them).
      return ((role === "requester" || role === "helper") && request.status === "matched") || (role === "requester" && request.status === "open");
    default:
      return false;
  }
}

/** Picks who Nova asks directly: people who agreed to introductions, most recently active first. */
export function pickHelpers(input: { requesterId: string; consented: string[]; lastActive: Map<string, number>; excluded?: (userId: string) => boolean; limit?: number }): string[] {
  const seen = new Set<string>();
  return input.consented
    .filter((userId) => userId !== input.requesterId && !input.excluded?.(userId) && !seen.has(userId) && Boolean(seen.add(userId)))
    .sort((left, right) => (input.lastActive.get(right) ?? 0) - (input.lastActive.get(left) ?? 0))
    .slice(0, input.limit ?? MAX_ASKED_HELPERS);
}

export type RequestView = {
  id: string;
  kind: RequestKind;
  body: string;
  role: Role;
  status: RequestRow["status"];
  /** Requester only, while open: how many people said «Могу» and wait for the confirmation. */
  ready: Array<{ offerId: string }>;
  /** Invited only: whether this person already said «Могу». */
  saidCan: boolean;
  /** Requester only, while open: answers passed on by Nova without a connection. offerId lets the author continue with that person. */
  answers: Array<{ offerId: string | null; body: string }>;
  /** Invited only: the answer this person already sent through Nova. */
  myAnswer: string | null;
  iRevealed: boolean;
  theyRevealed: boolean;
  /** The other side's name, only when both revealed. */
  otherName: string | null;
  helped: boolean | null;
  messages: Array<{ id: string; mine: boolean; body: string; createdAt: string }>;
  createdAt: string;
};

/** What one person may see of a request. Never the other side's id, and a name only after both agreed. */
export function viewRequest(input: { request: RequestRow; offers: OfferRow[]; messages: MessageRow[]; userId: string; names: Map<string, string> }): RequestView | null {
  const { request, userId } = input;
  const ownOffer = input.offers.find((offer) => offer.helper_user_id === userId) ?? null;
  const role = roleFor(request, ownOffer, userId);
  if (role === "none") return null;
  if (role === "invited" && ownOffer?.status === "passed") return null;
  const inside = role === "requester" || role === "helper";
  const iRevealed = role === "requester" ? request.requester_reveal : role === "helper" ? request.helper_reveal : false;
  const theyRevealed = role === "requester" ? request.helper_reveal : role === "helper" ? request.requester_reveal : false;
  // Inside a connection only the two sides' messages are shown; answers of other people stay with the author.
  const pair = new Set([request.requester_user_id, request.helper_user_id ?? ""]);
  const outside = input.messages.filter((message) => message.sender_user_id !== request.requester_user_id);
  const otherId = role === "requester" ? request.helper_user_id : role === "helper" ? request.requester_user_id : null;
  return {
    id: request.id,
    kind: request.kind,
    body: request.body,
    role,
    status: request.status,
    ready: role === "requester" && request.status === "open" ? input.offers.filter((offer) => offer.status === "ready").map((offer) => ({ offerId: offer.id })) : [],
    saidCan: role === "invited" && ownOffer?.status === "ready",
    answers: role === "requester" && request.status === "open"
      ? outside.map((message) => ({ offerId: input.offers.find((offer) => offer.helper_user_id === message.sender_user_id && offer.status === "ready")?.id ?? null, body: message.body }))
      : [],
    myAnswer: role === "invited" ? outside.find((message) => message.sender_user_id === userId)?.body ?? null : null,
    iRevealed,
    theyRevealed,
    otherName: inside && iRevealed && theyRevealed && otherId ? input.names.get(otherId) ?? null : null,
    helped: role === "requester" ? request.helped : null,
    messages: inside && request.status !== "open" ? input.messages.filter((message) => pair.has(message.sender_user_id)).map((message) => ({ id: message.id, mine: message.sender_user_id === userId, body: message.body, createdAt: message.created_at })) : [],
    createdAt: request.created_at
  };
}

export const COLLECTION_STEPS = [1, 3, 5, 10, 25, 50, 100] as const;
export type ConnectionRow = Pick<RequestRow, "requester_user_id" | "helper_user_id" | "kind" | "requester_reveal" | "helper_reveal">;
export type Collection = {
  /** Different people this person was connected with through Nova. */
  people: number;
  /** Of them, people whose names both sides opened: they are in the person's contacts. */
  named: number;
  byKind: Record<RequestKind, number>;
  /** People I answered or helped, and people who helped me. */
  gave: number;
  received: number;
  nextStep: number | null;
};

/** The collection of connections: every different person counts once per kind, named or not. No ids leave the server. */
export function buildCollection(rows: ConnectionRow[], userId: string): Collection {
  const people = new Set<string>(), named = new Set<string>(), gave = new Set<string>(), received = new Set<string>();
  const kinds: Record<RequestKind, Set<string>> = { advice: new Set(), help: new Set(), partner: new Set(), talk: new Set() };
  for (const row of rows) {
    if (!row.helper_user_id) continue;
    const mine = row.requester_user_id === userId;
    if (!mine && row.helper_user_id !== userId) continue;
    const other = mine ? row.helper_user_id : row.requester_user_id;
    people.add(other);
    kinds[row.kind]?.add(other);
    (mine ? received : gave).add(other);
    if (row.requester_reveal && row.helper_reveal) named.add(other);
  }
  return {
    people: people.size,
    named: named.size,
    byKind: { advice: kinds.advice.size, help: kinds.help.size, partner: kinds.partner.size, talk: kinds.talk.size },
    gave: gave.size,
    received: received.size,
    nextStep: COLLECTION_STEPS.find((step) => step > people.size) ?? null
  };
}
