import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const AI_CHAT_DAY_LIMIT = 20;
export const AI_CHAT_MONTH_LIMIT = 300;
export const AI_CHAT_RATE_LIMIT = 6;
export const AI_CHAT_RATE_WINDOW_SECONDS = 60;
export const AI_CHAT_MAX_CONCURRENT = 1;

export type AiProviderName = "gemini" | "groq";

export type AiQuotaReservation = {
  allowed: boolean;
  dayCount: number;
  monthCount: number;
  dayRemaining: number;
  monthRemaining: number;
  dayLimit: number;
  monthLimit: number;
  dayKey: string;
  monthKey: string;
};

export type AiRequestGuardResult = {
  allowed: boolean;
  reason?: "rate_limit" | "concurrency";
  retryAfterSeconds: number;
  activeCount: number;
  windowCount: number;
};

export type AiProviderHealth = {
  enabled: boolean;
  blockedUntil: string | null;
  failureCount: number;
};

export type AiUsageEvent = {
  requestId: string;
  userId: string;
  capability: string;
  provider?: AiProviderName;
  model?: string;
  status: "quota_blocked" | "rate_limited" | "concurrency_blocked" | "accepted" | "failed";
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  policyVersion?: string;
};

export class AiQuotaServiceError extends Error {
  constructor() {
    super("AI quota service is unavailable.");
    this.name = "AiQuotaServiceError";
  }
}

type AiRpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

type AiQuery = {
  eq: (column: string, value: string) => AiQuery;
  maybeSingle: () => Promise<AiRpcResult>;
};

type AiTable = {
  insert: (values: Record<string, unknown>) => Promise<AiRpcResult>;
  select: (columns: string) => AiQuery;
};

type AiServiceClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<AiRpcResult>;
  from: (table: string) => AiTable;
};

export async function reserveAiChatMessage(userId: string): Promise<AiQuotaReservation> {
  let result: AiRpcResult;
  try {
    result = await getAiServiceClient().rpc("reserve_ai_chat_message", {
      p_user_id: userId,
      p_capability: "chat.general",
      p_day_limit: AI_CHAT_DAY_LIMIT,
      p_month_limit: AI_CHAT_MONTH_LIMIT
    });
  } catch (error) {
    console.error("AI quota reservation failed.", getErrorMessage(error));
    throw new AiQuotaServiceError();
  }

  if (result.error) {
    console.error("AI quota reservation returned an error.", result.error.message ?? "unknown error");
    throw new AiQuotaServiceError();
  }

  const reservation = parseQuotaReservation(result.data);
  if (!reservation) {
    console.error("AI quota reservation returned an invalid payload.");
    throw new AiQuotaServiceError();
  }

  return reservation;
}

export async function acquireAiRequest(userId: string): Promise<AiRequestGuardResult> {
  let result: AiRpcResult;
  try {
    result = await getAiServiceClient().rpc("acquire_ai_request", {
      p_user_id: userId,
      p_capability: "chat.general",
      p_rate_limit: AI_CHAT_RATE_LIMIT,
      p_window_seconds: AI_CHAT_RATE_WINDOW_SECONDS,
      p_max_concurrent: AI_CHAT_MAX_CONCURRENT
    });
  } catch (error) {
    console.error("AI request guard failed.", getErrorMessage(error));
    throw new AiQuotaServiceError();
  }

  if (result.error) {
    console.error("AI request guard returned an error.", result.error.message ?? "unknown error");
    throw new AiQuotaServiceError();
  }

  const guard = parseRequestGuard(result.data);
  if (!guard) {
    console.error("AI request guard returned an invalid payload.");
    throw new AiQuotaServiceError();
  }

  return guard;
}

export async function releaseAiRequest(userId: string): Promise<void> {
  try {
    const result = await getAiServiceClient().rpc("release_ai_request", {
      p_user_id: userId,
      p_capability: "chat.general"
    });
    if (result.error) console.error("AI request release returned an error.", result.error.message ?? "unknown error");
  } catch (error) {
    console.error("AI request release failed.", getErrorMessage(error));
  }
}

export async function recordAiUsageEvent(event: AiUsageEvent): Promise<void> {
  try {
    const result = await getAiServiceClient().from("ai_usage_events").insert({
      request_id: event.requestId,
      user_id: event.userId,
      capability: event.capability,
      provider: event.provider ?? null,
      model: event.model ?? null,
      route: "system",
      status: event.status,
      input_tokens: event.inputTokens ?? null,
      output_tokens: event.outputTokens ?? null,
      latency_ms: event.latencyMs ?? null,
      policy_version: event.policyVersion ?? null
    });
    if (result.error) console.error("AI usage event was not recorded.", result.error.message ?? "unknown error");
  } catch (error) {
    console.error("AI usage event failed.", getErrorMessage(error));
  }
}

export async function getAiProviderHealth(provider: AiProviderName): Promise<AiProviderHealth | null> {
  try {
    const result = await getAiServiceClient()
      .from("ai_provider_health")
      .select("enabled, blocked_until, failure_count")
      .eq("provider", provider)
      .maybeSingle();

    if (result.error) {
      console.error("AI provider health lookup failed.", result.error.message ?? "unknown error");
      return null;
    }

    return parseProviderHealth(result.data);
  } catch (error) {
    console.error("AI provider health lookup failed.", getErrorMessage(error));
    return null;
  }
}

export async function markAiProviderFailure(
  provider: AiProviderName,
  failureCode: string,
  retryAfterMs?: number | null
): Promise<void> {
  const health = await getAiProviderHealth(provider);
  const exponentialCooldownMs = Math.min(
    30 * 60 * 1_000,
    30 * 1_000 * 2 ** Math.min(health?.failureCount ?? 0, 6)
  );
  const cooldownMs = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : exponentialCooldownMs;
  const blockedUntil = new Date(Date.now() + cooldownMs).toISOString();

  try {
    const result = await getAiServiceClient().rpc("mark_ai_provider_failure", {
      p_provider: provider,
      p_failure_code: failureCode.slice(0, 120),
      p_blocked_until: blockedUntil
    });
    if (result.error) console.error("AI provider failure state was not recorded.", result.error.message ?? "unknown error");
  } catch (error) {
    console.error("AI provider failure state failed.", getErrorMessage(error));
  }
}

export async function markAiProviderSuccess(provider: AiProviderName): Promise<void> {
  try {
    const result = await getAiServiceClient().rpc("mark_ai_provider_success", { p_provider: provider });
    if (result.error) console.error("AI provider success state was not recorded.", result.error.message ?? "unknown error");
  } catch (error) {
    console.error("AI provider success state failed.", getErrorMessage(error));
  }
}

export function estimateAiTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function getAiServiceClient(): AiServiceClient {
  return createServiceSupabaseClient() as unknown as AiServiceClient;
}

function parseQuotaReservation(value: unknown): AiQuotaReservation | null {
  if (!isRecord(value)) return null;
  const allowed = booleanValue(value.allowed);
  const dayCount = integerValue(value.dayCount);
  const monthCount = integerValue(value.monthCount);
  const dayRemaining = integerValue(value.dayRemaining);
  const monthRemaining = integerValue(value.monthRemaining);
  const dayLimit = integerValue(value.dayLimit);
  const monthLimit = integerValue(value.monthLimit);
  const dayKey = stringValue(value.dayKey);
  const monthKey = stringValue(value.monthKey);

  if (allowed === null || dayCount === null || monthCount === null || dayRemaining === null || monthRemaining === null || dayLimit === null || monthLimit === null || !dayKey || !monthKey) {
    return null;
  }

  return { allowed, dayCount, monthCount, dayRemaining, monthRemaining, dayLimit, monthLimit, dayKey, monthKey };
}

function parseRequestGuard(value: unknown): AiRequestGuardResult | null {
  if (!isRecord(value)) return null;
  const allowed = booleanValue(value.allowed);
  const retryAfterSeconds = integerValue(value.retryAfterSeconds);
  const activeCount = integerValue(value.activeCount);
  const windowCount = integerValue(value.windowCount);
  const reason = value.reason === "rate_limit" || value.reason === "concurrency" ? value.reason : undefined;
  if (allowed === null || retryAfterSeconds === null || activeCount === null || windowCount === null) return null;
  return { allowed, reason, retryAfterSeconds, activeCount, windowCount };
}

function parseProviderHealth(value: unknown): AiProviderHealth | null {
  if (!isRecord(value)) return null;
  const enabled = booleanValue(value.enabled);
  const failureCount = integerValue(value.failure_count);
  const blockedUntil = value.blocked_until === null ? null : stringValue(value.blocked_until);
  if (enabled === null || failureCount === null || value.blocked_until !== null && !blockedUntil) return null;
  return { enabled, blockedUntil, failureCount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
