import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

type UntypedSupabaseClient = SupabaseClient<any>;

export type ConfirmationBox = "incoming" | "outgoing" | "all";

export type TrustEventType =
  | "help_given"
  | "help_received"
  | "deal_completed"
  | "challenge_confirmed"
  | "proof_added";

export type ConfirmationType = TrustEventType | "contact_confirmed";

export type TrustSourceType = "challenge" | "wish" | "feed_post" | "marketplace_deal" | "team_contact" | "manual";

export type MutualConfirmationRow = {
  id: string;
  requester_user_id: string;
  counterparty_user_id: string;
  confirmation_type: ConfirmationType;
  source_type: TrustSourceType;
  source_id: string | null;
  message: string | null;
  status: "pending" | "confirmed" | "declined" | "expired";
  trust_event_id: string | null;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type TrustEventRow = {
  id: string;
  actor_user_id: string;
  target_user_id: string;
  event_type: TrustEventType;
  source_type: TrustSourceType;
  source_id: string | null;
  status: "pending" | "confirmed" | "rejected" | "revoked";
  created_by_user_id: string;
  confirmed_by_user_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type ReciprocityBalanceRow = {
  user_id: string;
  help_given_count: number;
  help_received_count: number;
  deals_completed_count: number;
  confirmations_given_count: number;
  confirmations_received_count: number;
  recent_positive_events: number;
  reciprocity_score: number;
  updated_at: string;
};

export type CreateConfirmationInput = {
  requesterUserId: string;
  counterpartyUserId: string;
  confirmationType: ConfirmationType;
  sourceType: TrustSourceType;
  sourceId: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
  expiresInDays: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFIRMATION_TYPES = new Set<ConfirmationType>([
  "help_given",
  "help_received",
  "deal_completed",
  "challenge_confirmed",
  "proof_added",
  "contact_confirmed"
]);
const SOURCE_TYPES = new Set<TrustSourceType>(["challenge", "wish", "feed_post", "marketplace_deal", "team_contact", "manual"]);

export function createTrustAdminClient(): UntypedSupabaseClient {
  return createServiceSupabaseClient() as unknown as UntypedSupabaseClient;
}

export function normalizeUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export function normalizeConfirmationType(value: unknown): ConfirmationType | null {
  return typeof value === "string" && CONFIRMATION_TYPES.has(value as ConfirmationType) ? (value as ConfirmationType) : null;
}

export function normalizeTrustSourceType(value: unknown): TrustSourceType {
  return typeof value === "string" && SOURCE_TYPES.has(value as TrustSourceType) ? (value as TrustSourceType) : "manual";
}

export function normalizeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export function normalizeMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function normalizeExpiresInDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 7;
  return Math.max(1, Math.min(30, Math.round(value)));
}

export function normalizeConfirmationBox(value: string | null): ConfirmationBox {
  return value === "incoming" || value === "outgoing" ? value : "all";
}

export async function listConfirmations(
  supabase: UntypedSupabaseClient,
  userId: string,
  box: ConfirmationBox
): Promise<MutualConfirmationRow[]> {
  let query = supabase
    .from("mutual_confirmations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (box === "incoming") query = query.eq("counterparty_user_id", userId);
  if (box === "outgoing") query = query.eq("requester_user_id", userId);
  if (box === "all") query = query.or(`requester_user_id.eq.${userId},counterparty_user_id.eq.${userId}`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MutualConfirmationRow[];
}

export async function createConfirmation(
  supabase: UntypedSupabaseClient,
  input: CreateConfirmationInput
): Promise<MutualConfirmationRow> {
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("mutual_confirmations")
    .insert({
      requester_user_id: input.requesterUserId,
      counterparty_user_id: input.counterpartyUserId,
      confirmation_type: input.confirmationType,
      source_type: input.sourceType,
      source_id: input.sourceId,
      message: input.message,
      status: "pending",
      expires_at: expiresAt,
      metadata: input.metadata
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as MutualConfirmationRow;
}

export async function confirmMutualConfirmation(
  supabase: UntypedSupabaseClient,
  confirmationId: string,
  userId: string
): Promise<{ confirmation: MutualConfirmationRow; trustEvent: TrustEventRow; balances: ReciprocityBalanceRow[] }> {
  const confirmation = await loadConfirmationForCounterparty(supabase, confirmationId, userId);
  await assertPendingConfirmation(supabase, confirmation);

  const trustEvent = await createConfirmedTrustEvent(supabase, confirmation, userId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("mutual_confirmations")
    .update({
      status: "confirmed",
      responded_at: now,
      trust_event_id: trustEvent.id,
      updated_at: now
    })
    .eq("id", confirmation.id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) throw error;

  const balances = await Promise.all([
    recalculateReciprocityBalance(supabase, confirmation.requester_user_id),
    recalculateReciprocityBalance(supabase, confirmation.counterparty_user_id)
  ]);

  return { confirmation: data as MutualConfirmationRow, trustEvent, balances };
}

export async function declineMutualConfirmation(
  supabase: UntypedSupabaseClient,
  confirmationId: string,
  userId: string
): Promise<MutualConfirmationRow> {
  const confirmation = await loadConfirmationForCounterparty(supabase, confirmationId, userId);
  await assertPendingConfirmation(supabase, confirmation);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("mutual_confirmations")
    .update({ status: "declined", responded_at: now, updated_at: now })
    .eq("id", confirmation.id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) throw error;
  return data as MutualConfirmationRow;
}

export async function loadTrustSummary(
  supabase: UntypedSupabaseClient,
  userId: string
): Promise<{ balance: ReciprocityBalanceRow; recentEvents: TrustEventRow[] }> {
  const { data: balance, error: balanceError } = await supabase
    .from("reciprocity_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (balanceError) throw balanceError;

  const { data: recentEvents, error: eventsError } = await supabase
    .from("trust_events")
    .select("*")
    .eq("status", "confirmed")
    .or(`actor_user_id.eq.${userId},target_user_id.eq.${userId}`)
    .order("confirmed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (eventsError) throw eventsError;

  return {
    balance: (balance as ReciprocityBalanceRow | null) ?? emptyBalance(userId),
    recentEvents: (recentEvents ?? []) as TrustEventRow[]
  };
}

export function isDuplicatePendingConfirmationError(error: unknown): boolean {
  return isSupabaseError(error) && error.code === "23505";
}

export function isMissingConfirmationError(error: unknown): boolean {
  return error instanceof Error && error.message === "Confirmation request not found.";
}

export function isInvalidConfirmationStateError(error: unknown): boolean {
  return error instanceof Error && (error.message === "Confirmation request is not pending." || error.message === "Confirmation request has expired.");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadConfirmationForCounterparty(
  supabase: UntypedSupabaseClient,
  confirmationId: string,
  userId: string
): Promise<MutualConfirmationRow> {
  const { data, error } = await supabase
    .from("mutual_confirmations")
    .select("*")
    .eq("id", confirmationId)
    .eq("counterparty_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Confirmation request not found.");
  return data as MutualConfirmationRow;
}

async function assertPendingConfirmation(supabase: UntypedSupabaseClient, confirmation: MutualConfirmationRow) {
  if (confirmation.status !== "pending") throw new Error("Confirmation request is not pending.");
  if (Date.parse(confirmation.expires_at) > Date.now()) return;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("mutual_confirmations")
    .update({ status: "expired", updated_at: now })
    .eq("id", confirmation.id)
    .eq("status", "pending");

  if (error) throw error;
  throw new Error("Confirmation request has expired.");
}

async function createConfirmedTrustEvent(
  supabase: UntypedSupabaseClient,
  confirmation: MutualConfirmationRow,
  confirmedByUserId: string
): Promise<TrustEventRow> {
  const eventType = mapConfirmationToEventType(confirmation.confirmation_type);
  const now = new Date().toISOString();

  if (confirmation.source_id) {
    const { data: existing, error: existingError } = await supabase
      .from("trust_events")
      .select("*")
      .eq("actor_user_id", confirmation.requester_user_id)
      .eq("target_user_id", confirmation.counterparty_user_id)
      .eq("event_type", eventType)
      .eq("source_type", confirmation.source_type)
      .eq("source_id", confirmation.source_id)
      .eq("status", "confirmed")
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return existing as TrustEventRow;
  }

  const { data, error } = await supabase
    .from("trust_events")
    .insert({
      actor_user_id: confirmation.requester_user_id,
      target_user_id: confirmation.counterparty_user_id,
      event_type: eventType,
      source_type: confirmation.source_type,
      source_id: confirmation.source_id,
      status: "confirmed",
      created_by_user_id: confirmation.requester_user_id,
      confirmed_by_user_id: confirmedByUserId,
      confirmed_at: now,
      metadata: {
        ...confirmation.metadata,
        confirmation_id: confirmation.id,
        confirmation_message: confirmation.message
      }
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as TrustEventRow;
}

async function recalculateReciprocityBalance(
  supabase: UntypedSupabaseClient,
  userId: string
): Promise<ReciprocityBalanceRow> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [
    helpGivenCount,
    helpReceivedCount,
    dealsCompletedCount,
    confirmationsGivenCount,
    confirmationsReceivedCount,
    recentPositiveEvents,
    unresolvedPendingCount
  ] = await Promise.all([
    countRows(supabase.from("trust_events").select("id", { count: "exact", head: true }).eq("actor_user_id", userId).eq("event_type", "help_given").eq("status", "confirmed")),
    countRows(supabase.from("trust_events").select("id", { count: "exact", head: true }).eq("target_user_id", userId).eq("event_type", "help_given").eq("status", "confirmed")),
    countRows(supabase.from("trust_events").select("id", { count: "exact", head: true }).eq("event_type", "deal_completed").eq("status", "confirmed").or(`actor_user_id.eq.${userId},target_user_id.eq.${userId}`)),
    countRows(supabase.from("mutual_confirmations").select("id", { count: "exact", head: true }).eq("counterparty_user_id", userId).eq("status", "confirmed")),
    countRows(supabase.from("mutual_confirmations").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).eq("status", "confirmed")),
    countRows(supabase.from("trust_events").select("id", { count: "exact", head: true }).eq("status", "confirmed").gte("created_at", thirtyDaysAgo).or(`actor_user_id.eq.${userId},target_user_id.eq.${userId}`)),
    countRows(supabase.from("mutual_confirmations").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).eq("status", "pending").gt("expires_at", new Date().toISOString()))
  ]);

  const reciprocityScore =
    helpGivenCount * 2 + confirmationsGivenCount + dealsCompletedCount * 2 + recentPositiveEvents - unresolvedPendingCount;

  const { data, error } = await supabase
    .from("reciprocity_balances")
    .upsert(
      {
        user_id: userId,
        help_given_count: helpGivenCount,
        help_received_count: helpReceivedCount,
        deals_completed_count: dealsCompletedCount,
        confirmations_given_count: confirmationsGivenCount,
        confirmations_received_count: confirmationsReceivedCount,
        recent_positive_events: recentPositiveEvents,
        reciprocity_score: reciprocityScore,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as ReciprocityBalanceRow;
}

async function countRows(query: PromiseLike<{ count: number | null; error: Error | null }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function mapConfirmationToEventType(type: ConfirmationType): TrustEventType {
  return type === "contact_confirmed" ? "proof_added" : type;
}

function emptyBalance(userId: string): ReciprocityBalanceRow {
  return {
    user_id: userId,
    help_given_count: 0,
    help_received_count: 0,
    deals_completed_count: 0,
    confirmations_given_count: 0,
    confirmations_received_count: 0,
    recent_positive_events: 0,
    reciprocity_score: 0,
    updated_at: new Date().toISOString()
  };
}

function isSupabaseError(value: unknown): value is { code?: string } {
  return isRecord(value) && typeof value.code === "string";
}
