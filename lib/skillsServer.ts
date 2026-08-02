import type { SupabaseClient } from "@supabase/supabase-js";

export type SkillDbClient = SupabaseClient<any>;

export function asSkillDbClient(client: SupabaseClient<any>): SkillDbClient {
  return client;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 8 || value.length > 2048) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isBootstrapReviewer(userId: string): boolean {
  const configuredIds = (process.env.SKILL_REVIEWER_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configuredIds.includes(userId);
}

export function trimText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function isMissingSkillSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    code === "42P01"
    || code === "PGRST205"
    || message.includes("skills")
    || message.includes("skill_submissions")
  ) && (
    message.includes("does not exist")
    || message.includes("schema cache")
    || message.includes("could not find the table")
  );
}

