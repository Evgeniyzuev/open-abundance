import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { buildTreasuryCoverageReport, decideTreasuryAlert, type TreasuryCoverageReport } from "@/lib/treasuryCoverage";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * POST /api/internal/treasury/check
 *
 * Called by pg_cron every 15 minutes with the shared scanner secret. Builds the
 * coverage report, stores the last state and sends a notification to Growth
 * Operators only when the light turns yellow or red (plus one daily reminder
 * while it stays red). It never blocks withdrawals.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TON_SCANNER_SECRET?.trim();
  const provided = request.headers.get("x-ton-scanner-secret")?.trim() ?? "";
  if (!expected || !safeEqual(provided, expected)) return json({ error: "Unauthorized." }, 401);

  const supabase = createServiceSupabaseClient() as any;
  let report: TreasuryCoverageReport;
  try {
    report = await buildTreasuryCoverageReport(supabase);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not build the treasury report." }, 500);
  }

  const { data: state } = await supabase.from("treasury_coverage_state").select("*").eq("id", true).maybeSingle();
  const now = new Date();
  const decision = decideTreasuryAlert({
    light: report.light,
    lastNotifiedLight: state?.last_notified_light ?? null,
    lastNotifiedAt: state?.last_notified_at ? new Date(state.last_notified_at) : null,
    now
  });

  let notified = false;
  let recipients = 0;
  if (decision.notify) {
    const operatorIds = (process.env.GROWTH_OPERATOR_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(isUuid);
    recipients = operatorIds.length;
    if (recipients > 0) {
      const message = buildMessage(report);
      const { error } = await supabase.rpc("create_notification_event", {
        p_event_type: "treasury.coverage",
        p_category: "system",
        p_source_type: "treasury",
        p_source_id: report.light,
        p_title: message.title,
        p_body: message.body,
        p_deep_link: "/",
        p_recipient_user_ids: operatorIds,
        p_idempotency_key: `treasury-coverage:${report.light}:${Math.floor(now.getTime() / 60_000)}`,
        p_metadata: { light: report.light, coverageRatio: report.coverageRatio, stressCoverageRatio: report.stressCoverageRatio }
      });
      notified = !error;
    }
  }

  await supabase.from("treasury_coverage_state").update({
    last_light: report.light,
    last_ratio: report.coverageRatio,
    last_checked_at: now.toISOString(),
    ...(notified ? { last_notified_light: report.light, last_notified_at: now.toISOString() } : {}),
    // A green light resets the alert memory so the next yellow or red notifies again.
    ...(report.light === "green" ? { last_notified_light: null } : {}),
    updated_at: now.toISOString()
  }).eq("id", true);

  return json({ light: report.light, coverageRatio: report.coverageRatio, notify: decision.notify, notified, recipients }, 200);
}

function buildMessage(report: TreasuryCoverageReport): { title: string; body: string } {
  const ratio = report.coverageRatio === null ? "н/д" : report.coverageRatio.toFixed(2);
  const stress = report.stressCoverageRatio === null ? "н/д" : report.stressCoverageRatio.toFixed(2);
  const reserve = report.treasury.totalUsd === null ? "н/д" : `$${report.treasury.totalUsd.toFixed(2)}`;
  const liabilities = `$${report.liabilities.total.toFixed(2)}`;
  return {
    title: report.light === "red" ? "Покрытие Wallet: красный" : "Покрытие Wallet: жёлтый",
    body: `Резерв ${reserve}, обязательства ${liabilities}, покрытие ${ratio}, при падении TON на 30% ${stress}.`
  };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
