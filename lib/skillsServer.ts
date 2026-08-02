import type { SupabaseClient } from "@supabase/supabase-js";

export type SkillDbClient = SupabaseClient<any>;

export function asSkillDbClient(client: SupabaseClient<any>): SkillDbClient {
  return client;
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
    || message.includes("skill_level_rules")
    || message.includes("refresh_user_skill_levels")
  ) && (
    message.includes("does not exist")
    || message.includes("schema cache")
    || message.includes("could not find the table")
    || message.includes("could not find the function")
  );
}
