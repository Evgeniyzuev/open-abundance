import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { encryptPaymentDetails, isPaymentDetailsEncryptionConfigured, maskPaymentTarget } from "@/lib/p2pPaymentDetails";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Keep an explicit environment kill switch, while making authenticated P2P
// access available by default after the open-access migration.
const p2pTradingEnabled = process.env.P2P_TRADING_ENABLED !== "false";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    const db = supabase as any;
    const [memberResult, limitResult, methodsResult, adsResult, myAdsResult, buyingResult, sellingResult, fundResult, collateralResult] = await Promise.all([
      db.from("p2p_pilot_members").select("status,verified_name,approved_at").eq("user_id", user.id).maybeSingle(),
      db.rpc("p2p_available_limit", { p_user_id: user.id }),
      db.from("p2p_payment_methods").select("id,method_type,label,masked_details,is_active,is_reusable,created_at").eq("user_id", user.id).eq("is_reusable", true).order("created_at", { ascending: false }),
      db.from("p2p_ads").select("id,seller_user_id,direction,wallet_amount,available_amount,rub_per_wallet,min_wallet_amount,max_wallet_amount,status,created_at,payment_method:p2p_payment_methods(method_type,label,masked_details)").eq("status", "active").gt("available_amount", 0).order("rub_per_wallet", { ascending: true }).limit(100),
      db.from("p2p_ads").select("id,seller_user_id,direction,wallet_amount,available_amount,rub_per_wallet,min_wallet_amount,max_wallet_amount,status,created_at,payment_method:p2p_payment_methods(method_type,label,masked_details)").eq("seller_user_id", user.id).order("created_at", { ascending: false }).limit(100),
      db.from("p2p_orders").select("*,events:p2p_order_events(id,event_type,actor_type,created_at),dispute:p2p_disputes(id,status,reason,resolution,created_at)").eq("buyer_user_id", user.id).order("created_at", { ascending: false }).limit(50),
      db.from("p2p_orders").select("*,events:p2p_order_events(id,event_type,actor_type,created_at),dispute:p2p_disputes(id,status,reason,resolution,created_at)").eq("seller_user_id", user.id).order("created_at", { ascending: false }).limit(50),
      db.from("p2p_fund_accounts").select("wallet_balance,reserved_amount,externally_verified_at,updated_at").eq("id", true).maybeSingle(),
      db.from("p2p_wallet_collateral").select("amount,reserved_amount").eq("user_id", user.id).maybeSingle()
    ]);
    for (const result of [memberResult, limitResult, methodsResult, adsResult, myAdsResult, buyingResult, sellingResult, fundResult, collateralResult]) {
      if (result.error) return json({ error: result.error.message }, 500);
    }
    const member = memberResult.data ?? { status: "active" };
    const memberBlocked = ["suspended", "revoked"].includes(member.status);
    const orders = Array.from(new Map([...(buyingResult.data ?? []), ...(sellingResult.data ?? [])].map((order: any) => [order.id, order])).values());
    return json({
      tradingEnabled: p2pTradingEnabled,
      paymentDetailsEncryptionConfigured: isPaymentDetailsEncryptionConfigured(),
      member,
      limit: limitResult.data,
      collateral: collateralResult.data ?? { amount: 0, reserved_amount: 0 },
      paymentMethods: methodsResult.data ?? [],
      ads: memberBlocked ? [] : adsResult.data ?? [],
      myAds: myAdsResult.data ?? [],
      orders,
      fund: fundResult.data ? {
        availableAmount: Number(fundResult.data.wallet_balance) - Number(fundResult.data.reserved_amount),
        verifiedAt: fundResult.data.externally_verified_at,
        updatedAt: fundResult.data.updated_at
      } : null
    });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to load P2P." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    const db = supabase as any;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const idempotencyKey = cleanIdempotencyKey(body.idempotencyKey, user.id);
    if (action !== "create_payment_method" && !idempotencyKey) return json({ error: "Idempotency key is required." }, 400);

    if (action === "create_payment_method") {
      const methodType = body.methodType === "sbp" ? "sbp" : body.methodType === "bank_transfer" ? "bank_transfer" : null;
      const label = cleanText(body.label, 100);
      const holderName = cleanText(body.holderName, 160);
      const paymentTarget = cleanText(body.paymentTarget, 160);
      const bankName = cleanText(body.bankName, 120);
      if (!methodType || !label || !holderName || !paymentTarget || !bankName) return json({ error: "Complete all payment method fields." }, 400);
      const { data: member, error: memberError } = await db.from("p2p_pilot_members").select("status").eq("user_id", user.id).maybeSingle();
      if (memberError) return json({ error: memberError.message }, 500);
      if (["suspended", "revoked"].includes(member?.status)) return json({ error: "P2P access is restricted." }, 403);
      const data = await createPaymentMethod(db, user.id, { methodType, label, holderName, paymentTarget, bankName }, true);
      return json({ paymentMethod: data }, 201);
    }

    if (action === "create_ad") {
      if (!p2pTradingEnabled) return json({ error: "P2P trading is not enabled." }, 503);
      if (body.acceptCoreRecovery !== true) return json({ error: "Core recovery terms must be accepted." }, 400);
      const direction = body.direction === "buy" ? "buy" : "sell";
      let paymentMethodId = typeof body.paymentMethodId === "string" && isUuid(body.paymentMethodId) ? body.paymentMethodId : null;
      if (direction === "sell" && !paymentMethodId && body.paymentDetails && typeof body.paymentDetails === "object") {
        const details = cleanPaymentDetails(body.paymentDetails as Record<string, unknown>);
        if (!details) return json({ error: "Complete payment details before publishing the ad." }, 400);
        const created = await createPaymentMethod(db, user.id, details, body.savePaymentDetails === true);
        paymentMethodId = created.id;
      }
      if (direction === "sell" && !paymentMethodId) return json({ error: "Payment method is required." }, 400);
      const { data, error: rpcError } = await db.rpc("p2p_create_ad_v2", {
        p_owner_user_id: user.id,
        p_direction: direction,
        p_payment_method_id: paymentMethodId,
        p_wallet_amount: numberValue(body.walletAmount),
        p_rub_per_wallet: numberValue(body.rubPerWallet),
        p_min_wallet_amount: numberValue(body.minWalletAmount),
        p_max_wallet_amount: numberValue(body.maxWalletAmount),
        p_accept_core_recovery: true,
        p_idempotency_key: idempotencyKey
      });
      if (rpcError) return json({ error: rpcError.message }, 400);
      return json({ ad: data }, 201);
    }

    if (action === "create_order") {
      if (!p2pTradingEnabled) return json({ error: "P2P trading is not enabled." }, 503);
      if (body.acceptCoreRecovery !== true) return json({ error: "Core recovery terms must be accepted." }, 400);
      const adId = typeof body.adId === "string" && isUuid(body.adId) ? body.adId : null;
      if (!adId) return json({ error: "P2P ad is required." }, 400);
      let paymentMethodId = typeof body.paymentMethodId === "string" && isUuid(body.paymentMethodId) ? body.paymentMethodId : null;
      if (body.paymentDetails && typeof body.paymentDetails === "object") {
        const details = cleanPaymentDetails(body.paymentDetails as Record<string, unknown>);
        if (!details) return json({ error: "Complete payment details before sending the request." }, 400);
        const created = await createPaymentMethod(db, user.id, details, body.savePaymentDetails === true);
        paymentMethodId = created.id;
      }
      const { data, error: rpcError } = await db.rpc("p2p_create_order_v2", {
        p_requester_user_id: user.id,
        p_ad_id: adId,
        p_wallet_amount: numberValue(body.walletAmount),
        p_payment_method_id: paymentMethodId,
        p_accept_core_recovery: true,
        p_idempotency_key: idempotencyKey
      });
      if (rpcError) return json({ error: rpcError.message }, 400);
      return json({ order: data }, 201);
    }

    if (action === "cancel_ad") {
      const adId = typeof body.adId === "string" && isUuid(body.adId) ? body.adId : null;
      if (!adId) return json({ error: "P2P ad is required." }, 400);
      const { data, error: rpcError } = await db.rpc("p2p_cancel_ad", { p_ad_id: adId, p_seller_user_id: user.id, p_idempotency_key: idempotencyKey });
      if (rpcError) return json({ error: rpcError.message }, 400);
      return json({ ad: data });
    }

    if (action === "set_ad_status") {
      const adId = typeof body.adId === "string" && isUuid(body.adId) ? body.adId : null;
      if (!adId) return json({ error: "P2P ad is required." }, 400);
      const { data: ad } = await db.from("p2p_ads").select("status").eq("id", adId).eq("seller_user_id", user.id).maybeSingle();
      if (!ad) return json({ error: "P2P ad not found." }, 404);
      const nextStatus = ad.status === "active" ? "paused" : "active";
      const { data, error: rpcError } = await db.rpc("p2p_set_ad_status", { p_ad_id: adId, p_owner_user_id: user.id, p_status: nextStatus, p_idempotency_key: idempotencyKey });
      if (rpcError) return json({ error: rpcError.message }, 400);
      return json({ ad: data });
    }

    if (action === "change_collateral") {
      if (numberValue(body.amount) > 0 && !p2pTradingEnabled) return json({ error: "P2P trading is not enabled." }, 503);
      const { data, error: rpcError } = await db.rpc("p2p_change_collateral", {
        p_user_id: user.id,
        p_amount: numberValue(body.amount),
        p_idempotency_key: idempotencyKey
      });
      if (rpcError) return json({ error: rpcError.message }, 400);
      return json({ collateral: data });
    }

    if (["accept_order", "reject_order", "mark_paid", "confirm_received", "cancel", "open_dispute", "appeal"].includes(action)) {
      const orderId = typeof body.orderId === "string" && isUuid(body.orderId) ? body.orderId : null;
      if (!orderId) return json({ error: "P2P order is required." }, 400);
      const reason = cleanText(body.reason, 2000);
      const evidence = action === "open_dispute" || action === "appeal" ? { reason } : body.evidence && typeof body.evidence === "object" ? body.evidence : {};
      const { data, error: rpcError } = await db.rpc("p2p_order_action", {
        p_order_id: orderId,
        p_actor_user_id: user.id,
        p_action: action,
        p_idempotency_key: idempotencyKey,
        p_evidence: evidence
      });
      if (rpcError) return json({ error: rpcError.message }, 400);
      return json({ order: data });
    }

    return json({ error: "Unsupported P2P action." }, 400);
  } catch (routeError) {
    const code = routeError && typeof routeError === "object" && "code" in routeError ? (routeError as { code?: string }).code : undefined;
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to update P2P.", code }, code === "P2P_PAYMENT_DETAILS_NOT_CONFIGURED" ? 503 : 500);
  }
}

type PaymentDetailsInput = {
  methodType: "sbp" | "bank_transfer";
  label: string;
  holderName: string;
  paymentTarget: string;
  bankName: string;
};

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : null;
}

function cleanPaymentDetails(value: Record<string, unknown>): PaymentDetailsInput | null {
  const methodType = value.methodType === "sbp" ? "sbp" : value.methodType === "bank_transfer" ? "bank_transfer" : null;
  const label = cleanText(value.label, 100);
  const holderName = cleanText(value.holderName, 160);
  const paymentTarget = cleanText(value.paymentTarget, 160);
  const bankName = cleanText(value.bankName, 120);
  if (!methodType || !label || !holderName || !paymentTarget || !bankName) return null;
  return { methodType, label, holderName, paymentTarget, bankName };
}

async function createPaymentMethod(db: any, userId: string, details: PaymentDetailsInput, reusable: boolean) {
  if (!isPaymentDetailsEncryptionConfigured()) {
    const error = new Error("P2P payment detail encryption is not configured.");
    (error as Error & { code?: string }).code = "P2P_PAYMENT_DETAILS_NOT_CONFIGURED";
    throw error;
  }
  let encrypted;
  try {
    encrypted = encryptPaymentDetails({ holderName: details.holderName, paymentTarget: details.paymentTarget, bankName: details.bankName });
  } catch (error) {
    const wrapped = new Error(error instanceof Error ? error.message : "P2P payment detail encryption is not configured.");
    (wrapped as Error & { code?: string }).code = "P2P_PAYMENT_DETAILS_NOT_CONFIGURED";
    throw wrapped;
  }
  const { data, error } = await db.from("p2p_payment_methods").insert({
    user_id: userId,
    method_type: details.methodType,
    label: details.label,
    masked_details: `${details.bankName} · ${maskPaymentTarget(details.paymentTarget)}`,
    encrypted_payload: encrypted.encryptedPayload,
    encryption_iv: encrypted.encryptionIv,
    encryption_tag: encrypted.encryptionTag,
    key_version: encrypted.keyVersion,
    is_reusable: reusable
  }).select("id,method_type,label,masked_details,is_active,is_reusable,created_at").single();
  if (error) throw new Error(error.message);
  return data;
}

function cleanIdempotencyKey(value: unknown, userId: string): string | null {
  const clean = cleanText(value, 120);
  return clean ? `p2p:${userId}:${clean}`.slice(0, 200) : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
