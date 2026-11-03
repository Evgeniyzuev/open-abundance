import { NextRequest, NextResponse } from "next/server";
import { isAiPersonaKey, PERSONA_HOST_ID, personaCommentKey } from "@/lib/aiPersonas";
import { authorizeClaudeOrOperator } from "@/lib/claudeActionsAuth";
import { COMMENT_MAX_CHARS } from "@/lib/feedComments";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const SLUG = /^[a-z0-9_-]{1,60}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/internal/feed/persona-comment { postId, persona, slug, body, parentCommentId? } — an AI character's comment
 * under a story (lib/aiPersonas.ts). The same persona + slug edits the comment instead of adding another. No
 * notifications are sent. Callers: operator or Claude (CLAUDE_ACTIONS_TOKEN), only for texts the operator approved.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const payload = await request.json().catch(() => null) as { postId?: unknown; persona?: unknown; slug?: unknown; body?: unknown; parentCommentId?: unknown } | null;
  const postId = typeof payload?.postId === "string" ? payload.postId : "";
  const slug = typeof payload?.slug === "string" ? payload.slug : "";
  const body = typeof payload?.body === "string" ? payload.body.trim().slice(0, COMMENT_MAX_CHARS) : "";
  const parentCommentId = typeof payload?.parentCommentId === "string" && UUID.test(payload.parentCommentId) ? payload.parentCommentId : null;
  if (!UUID.test(postId) || !isAiPersonaKey(payload?.persona) || !SLUG.test(slug) || !body) {
    return json({ error: "postId, persona, slug (a-z0-9_-) and body are required." }, 400);
  }
  const db = createServiceSupabaseClient() as any;
  const key = personaCommentKey(payload.persona, slug);
  const { data: existing, error: findError } = await db.from("feed_post_comments").select("id").eq("user_id", PERSONA_HOST_ID).eq("client_idempotency_key", key).maybeSingle();
  if (findError) return json({ error: findError.message }, 500);
  const row = { post_id: postId, user_id: PERSONA_HOST_ID, body, client_idempotency_key: key, parent_comment_id: parentCommentId, deleted_at: null, updated_at: new Date().toISOString() };
  const saved = existing
    ? await db.from("feed_post_comments").update(row).eq("id", existing.id).select("id").single()
    : await db.from("feed_post_comments").insert(row).select("id").single();
  if (saved.error) return json({ error: saved.error.message }, 500);
  return json({ ok: true, commentId: saved.data.id, created: !existing }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
