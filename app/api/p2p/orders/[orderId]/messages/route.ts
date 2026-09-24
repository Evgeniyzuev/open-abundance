import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MIME_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user) return json({ error: auth.error }, 401);
  const db = auth.supabase as any;
  const access = await getOrderAccess(db, params.orderId, auth.user.id);
  if (!access.ok) return json({ error: access.error }, access.status);
  const { data, error } = await db.from("p2p_order_messages").select("id,order_id,sender_user_id,body,attachment_name,attachment_mime,attachment_size,attachment_path,created_at").eq("order_id", params.orderId).order("created_at", { ascending: true });
  if (error) return json({ error: error.message }, 500);
  const messages = await Promise.all((data ?? []).map(async (message: any) => {
    if (!message.attachment_path) return { ...message, attachment_path: undefined };
    const signed = await db.storage.from("p2p-order-attachments").createSignedUrl(message.attachment_path, 60 * 30);
    return { ...message, attachment_path: undefined, attachmentUrl: signed.data?.signedUrl ?? null };
  }));
  return json({ messages });
}

export async function POST(request: NextRequest, { params }: { params: { orderId: string } }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user) return json({ error: auth.error }, 401);
  const db = auth.supabase as any;
  const access = await getOrderAccess(db, params.orderId, auth.user.id);
  if (!access.ok || access.operator) return json({ error: access.ok ? "Operators use the evidence view." : access.error }, access.ok ? 403 : access.status);
  const form = await request.formData();
  const bodyValue = form.get("body");
  const body = typeof bodyValue === "string" ? bodyValue.trim().slice(0, 4000) : "";
  const fileValue = form.get("file");
  const file = fileValue instanceof File ? fileValue : null;
  if (!body && !file) return json({ error: "Message text or a receipt is required." }, 400);
  let attachmentPath: string | null = null;
  let attachmentName: string | null = null;
  let attachmentMime: string | null = null;
  let attachmentSize: number | null = null;
  if (file) {
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension || file.size > MAX_ATTACHMENT_SIZE) return json({ error: "Use JPG, PNG or PDF up to 10 MB." }, 400);
    attachmentPath = `${auth.user.id}/${params.orderId}/${crypto.randomUUID()}.${extension}`;
    attachmentName = file.name.slice(0, 180);
    attachmentMime = file.type;
    attachmentSize = file.size;
    const upload = await db.storage.from("p2p-order-attachments").upload(attachmentPath, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (upload.error) return json({ error: upload.error.message }, 500);
  }
  const { data, error } = await db.from("p2p_order_messages").insert({ order_id: params.orderId, sender_user_id: auth.user.id, body: body || null, attachment_path: attachmentPath, attachment_name: attachmentName, attachment_mime: attachmentMime, attachment_size: attachmentSize }).select("id,order_id,sender_user_id,body,attachment_name,attachment_mime,attachment_size,created_at").single();
  if (error) {
    if (attachmentPath) await db.storage.from("p2p-order-attachments").remove([attachmentPath]);
    return json({ error: error.message }, 500);
  }
  await db.rpc("create_notification_event", { p_event_type: "p2p.order.message", p_category: "deals", p_entity_type: "p2p_order", p_entity_id: params.orderId, p_title: "P2P order message", p_body: "Open the order to view a new message.", p_deep_link: `/?view=wallet.p2p&order=${params.orderId}`, p_recipient_user_ids: [access.order.buyer_user_id, access.order.seller_user_id], p_idempotency_key: `p2p-message:${data.id}`, p_metadata: {} });
  return json({ message: data }, 201);
}

async function getOrderAccess(db: any, orderId: string, userId: string) {
  if (!isUuid(orderId)) return { ok: false as const, status: 400, error: "Invalid P2P order ID." };
  const { data: order, error } = await db.from("p2p_orders").select("id,buyer_user_id,seller_user_id").eq("id", orderId).maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  const operator = isGrowthOperator(userId);
  if (!order || (!operator && ![order.buyer_user_id, order.seller_user_id].includes(userId))) return { ok: false as const, status: 404, error: "P2P order not found." };
  return { ok: true as const, order, operator };
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
