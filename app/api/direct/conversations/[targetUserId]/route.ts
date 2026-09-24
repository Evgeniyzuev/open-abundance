import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { SHARE_TO_OA_ENABLED } from "@/lib/shareToOA";
import { recordProductEvent } from "@/lib/serverAnalytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type DirectSupabase = SupabaseClient<Database>;
type DirectConversation = Tables<"direct_conversations">;
type DirectMessage = Tables<"direct_messages">;
type MessageBody = {
  body?: unknown;
  contentPostId?: unknown;
};
type ProfileRow = Pick<Tables<"user_profiles">, "user_id" | "username" | "display_name" | "avatar_url" | "avatar_position" | "level" | "created_at">;

export async function GET(request: NextRequest, { params }: { params: { targetUserId: string } }) {
  try {
    const targetUserId = normalizeUuid(params.targetUserId);
    if (!targetUserId) return NextResponse.json({ error: "Invalid target user id." }, { status: 400, headers: NO_STORE_HEADERS });

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    if (targetUserId === user.id) return NextResponse.json({ error: "Cannot message yourself." }, { status: 400, headers: NO_STORE_HEADERS });

    const targetProfile = await loadProfile(supabase, targetUserId);
    if (!targetProfile) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const conversation = await findConversation(supabase, user.id, targetUserId);
    const messages = conversation ? await loadMessages(supabase, conversation.id) : [];

    return NextResponse.json({ targetProfile, conversation, messages }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: getRouteErrorMessage(routeError, "Failed to load direct conversation.") },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { targetUserId: string } }) {
  try {
    const targetUserId = normalizeUuid(params.targetUserId);
    if (!targetUserId) return NextResponse.json({ error: "Invalid target user id." }, { status: 400, headers: NO_STORE_HEADERS });

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    if (targetUserId === user.id) return NextResponse.json({ error: "Cannot message yourself." }, { status: 400, headers: NO_STORE_HEADERS });

    const requestBody = await readJsonBody(request);
    const hasContentPostId = requestBody.contentPostId !== undefined && requestBody.contentPostId !== null && requestBody.contentPostId !== "";
    const contentPostId = normalizeUuid(requestBody.contentPostId);
    if (hasContentPostId && !contentPostId) {
      return NextResponse.json({ error: "Invalid saved material id." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const body = normalizeMessageBody(requestBody);
    if (!contentPostId && !body) return NextResponse.json({ error: "Message is empty." }, { status: 400, headers: NO_STORE_HEADERS });

    const targetProfile = await loadProfile(supabase, targetUserId);
    if (!targetProfile) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

    if (contentPostId) {
      if (!SHARE_TO_OA_ENABLED) return NextResponse.json({ error: "Sharing saved materials is not enabled yet." }, { status: 404, headers: NO_STORE_HEADERS });
      const idempotencyKey = normalizeIdempotencyKey(request.headers.get("Idempotency-Key"));
      if (!idempotencyKey) {
        return NextResponse.json({ error: "A valid Idempotency-Key header is required to share saved material." }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const { data: messageId, error: shareError } = await supabase.rpc("share_saved_content_message", {
        p_body: body,
        p_client_idempotency_key: idempotencyKey,
        p_post_id: contentPostId,
        p_sender_user_id: user.id,
        p_target_user_id: targetUserId
      });
      if (shareError) {
        const mappedError = mapShareError(shareError.message);
        return NextResponse.json({ error: mappedError.message }, { status: mappedError.status, headers: NO_STORE_HEADERS });
      }
      await recordProductEvent({ entityId: contentPostId, entityType: "feed_post", eventName: "saved_content_sent", properties: {}, source: "server", userId: user.id });

      const [{ data: message, error: messageError }, conversation] = await Promise.all([
        supabase.from("direct_messages").select("*").eq("id", messageId).maybeSingle(),
        findConversation(supabase, user.id, targetUserId)
      ]);
      if (messageError) throw messageError;
      if (!message || !conversation) throw new Error("Shared message could not be loaded.");

      const messages = await loadMessages(supabase, conversation.id);
      return NextResponse.json(
        {
          targetProfile,
          conversation,
          message: message as DirectMessage,
          messages
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (!body) return NextResponse.json({ error: "Message is empty." }, { status: 400, headers: NO_STORE_HEADERS });

    const canSend = await checkMessageRateLimit(supabase, user.id, targetUserId);
    if (!canSend) {
      return NextResponse.json({ error: "Message limit reached. Try again later." }, { status: 429, headers: NO_STORE_HEADERS });
    }

    const conversation = await getOrCreateConversation(supabase, user.id, targetUserId);
    const now = new Date().toISOString();
    const { data: message, error: messageError } = await supabase
      .from("direct_messages")
      .insert({
        conversation_id: conversation.id,
        sender_user_id: user.id,
        body,
        status: "sent"
      })
      .select("*")
      .single();

    if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: updatedConversation, error: updateError } = await supabase
      .from("direct_conversations")
      .update({
        last_message_at: now,
        last_message_preview: body.slice(0, 120)
      })
      .eq("id", conversation.id)
      .select("*")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const messages = await loadMessages(supabase, conversation.id);
    return NextResponse.json(
      {
        targetProfile,
        conversation: updatedConversation as DirectConversation,
        message: message as DirectMessage,
        messages
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: getRouteErrorMessage(routeError, "Failed to send direct message.") },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadProfile(supabase: DirectSupabase, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,avatar_position,level,created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function findConversation(supabase: DirectSupabase, userA: string, userB: string): Promise<DirectConversation | null> {
  const { data, error } = await supabase
    .from("direct_conversations")
    .select("*")
    .eq("conversation_key", directConversationKey(userA, userB))
    .maybeSingle();

  if (error) throw error;
  return data as DirectConversation | null;
}

async function getOrCreateConversation(supabase: DirectSupabase, senderUserId: string, targetUserId: string): Promise<DirectConversation> {
  const existing = await findConversation(supabase, senderUserId, targetUserId);
  if (existing) return existing;

  const { data: conversation, error: conversationError } = await supabase
    .from("direct_conversations")
    .insert({
      conversation_type: "direct",
      conversation_key: directConversationKey(senderUserId, targetUserId),
      created_by_user_id: senderUserId
    })
    .select("*")
    .single();

  if (conversationError) {
    const raceWinner = await findConversation(supabase, senderUserId, targetUserId);
    if (raceWinner) return raceWinner;
    throw conversationError;
  }

  const { error: participantsError } = await supabase
    .from("direct_conversation_participants")
    .upsert([
      { conversation_id: conversation.id, user_id: senderUserId },
      { conversation_id: conversation.id, user_id: targetUserId }
    ], { onConflict: "conversation_id,user_id" });

  if (participantsError) throw participantsError;
  return conversation as DirectConversation;
}

async function loadMessages(supabase: DirectSupabase, conversationId: string): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return ((data ?? []) as DirectMessage[]).reverse();
}

async function checkMessageRateLimit(supabase: DirectSupabase, senderUserId: string, targetUserId: string): Promise<boolean> {
  const [contactResult, messageCountResult] = await Promise.all([
    supabase
      .from("user_contacts")
      .select("contact_user_id", { count: "exact", head: true })
      .eq("owner_user_id", senderUserId)
      .eq("contact_user_id", targetUserId)
      .eq("status", "active"),
    supabase
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_user_id", senderUserId)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
  ]);

  if (contactResult.error) throw contactResult.error;
  if (messageCountResult.error) throw messageCountResult.error;

  if (contactResult.count) return (messageCountResult.count ?? 0) < 60;
  return (messageCountResult.count ?? 0) < 20;
}

async function readJsonBody(request: NextRequest): Promise<MessageBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeMessageBody(body: MessageBody): string | null {
  if (typeof body.body !== "string") return null;
  const trimmed = body.body.trim();
  return trimmed ? trimmed.slice(0, 2000) : null;
}

function directConversationKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function normalizeIdempotencyKey(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
}

function mapShareError(message: string): { status: number; message: string } {
  if (message.includes("Saved material not found")) return { status: 404, message: "Saved material not found." };
  if (message.includes("Recipient not found")) return { status: 404, message: "Profile not found." };
  if (message.includes("Message limit reached")) return { status: 429, message: "Message limit reached. Try again later." };
  if (message.includes("Idempotency key was already used")) return { status: 409, message: "This request key was already used for a different share." };
  if (message.includes("Invalid recipient or idempotency key")) return { status: 400, message: "Invalid share request." };
  return { status: 500, message: "Failed to share saved material." };
}

function getRouteErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
