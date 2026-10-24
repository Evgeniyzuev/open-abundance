import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * PUT /api/abundance/notes { clientNoteId, body } — saves a note from the built-in "Abundance" list. The list says
 * that the team and AI read these notes; a changed text counts as new again.
 * DELETE /api/abundance/notes { clientNoteId } — the note was deleted or moved out of the list.
 */
export async function PUT(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const payload = await request.json().catch(() => null) as { clientNoteId?: unknown; body?: unknown } | null;
  const clientNoteId = typeof payload?.clientNoteId === "string" ? payload.clientNoteId.trim().slice(0, 80) : "";
  const body = typeof payload?.body === "string" ? payload.body.trim().slice(0, 4000) : "";
  if (!clientNoteId || !body) return json({ error: "clientNoteId and body are required." }, 400);
  const db = createServiceSupabaseClient() as any;
  const { data: existing, error: readError } = await db
    .from("abundance_notes")
    .select("id,body")
    .eq("user_id", user.id)
    .eq("client_note_id", clientNoteId)
    .maybeSingle();
  if (readError) return json({ error: "Abundance notes are not ready yet.", code: "not_ready" }, 503);
  if (existing?.body === body) return json({ saved: true, changed: false }, 200);
  const now = new Date().toISOString();
  const { error: writeError } = await db.from("abundance_notes").upsert({
    user_id: user.id,
    client_note_id: clientNoteId,
    body,
    is_operator: isGrowthOperator(user.id),
    status: "new",
    updated_at: now
  }, { onConflict: "user_id,client_note_id" });
  if (writeError) return json({ error: writeError.message }, 500);
  return json({ saved: true, changed: true }, 200);
}

export async function DELETE(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const payload = await request.json().catch(() => null) as { clientNoteId?: unknown } | null;
  const clientNoteId = typeof payload?.clientNoteId === "string" ? payload.clientNoteId.trim().slice(0, 80) : "";
  if (!clientNoteId) return json({ error: "clientNoteId is required." }, 400);
  const db = createServiceSupabaseClient() as any;
  const { error: deleteError } = await db.from("abundance_notes").delete().eq("user_id", user.id).eq("client_note_id", clientNoteId);
  if (deleteError) return json({ error: "Abundance notes are not ready yet.", code: "not_ready" }, 503);
  return json({ deleted: true }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
