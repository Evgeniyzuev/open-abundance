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
 * Operators when the light turns yellow or red, when the report fails (unknown),
 * and with one status digest per day. It never blocks withdrawals.
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
    lastDigestAt: state?.last_digest_at ? new Date(state.last_digest_at) : null,
    now
  });

  const operatorIds = (process.env.GROWTH_OPERATOR_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(isUuid);
  const recipients = operatorIds.length;
  let notified = false;
  let digestSent = false;
  if ((decision.alert || decision.digest) && recipients > 0) {
    const message = decision.alert ? buildAlertMessage(report) : buildDigestMessage(report);
    const kind = decision.alert ? "alert" : "digest";
    const { error } = await supabase.rpc("create_notification_event", {
      p_event_type: kind === "alert" ? "treasury.coverage" : "treasury.digest",
      p_category: "system",
      p_source_type: "treasury",
      p_source_id: report.light,
      p_title: message.title,
      p_body: message.body,
      p_deep_link: "/",
      p_recipient_user_ids: operatorIds,
      p_idempotency_key: `treasury-${kind}:${report.light}:${Math.floor(now.getTime() / 60_000)}`,
      p_metadata: { light: report.light, coverageRatio: report.coverageRatio, stressCoverageRatio: report.stressCoverageRatio }
    });
    notified = !error && decision.alert;
    digestSent = !error && decision.digest;
  }

  await supabase.from("treasury_coverage_state").update({
    last_light: report.light,
    last_ratio: report.coverageRatio,
    last_checked_at: now.toISOString(),
    ...(notified ? { last_notified_light: report.light, last_notified_at: now.toISOString() } : {}),
    ...(digestSent ? { last_digest_at: now.toISOString() } : {}),
    // A green light resets the alert memory so the next yellow or red notifies again.
    ...(report.light === "green" ? { last_notified_light: null } : {}),
    updated_at: now.toISOString()
  }).eq("id", true);

  return json({ light: report.light, coverageRatio: report.coverageRatio, alertDue: decision.alert, digestDue: decision.digest, notified, digestSent, recipients }, 200);
}

function formatFigures(report: TreasuryCoverageReport) {
  return {
    ratio: report.coverageRatio === null ? "н/д" : report.coverageRatio.toFixed(2),
    stress: report.stressCoverageRatio === null ? "н/д" : report.stressCoverageRatio.toFixed(2),
    reserve: report.treasury.totalUsd === null ? "н/д" : `$${report.treasury.totalUsd.toFixed(2)}`,
    liabilities: `$${report.liabilities.total.toFixed(2)}`,
    volatile: report.volatileShare === null ? "н/д" : `${Math.round(report.volatileShare * 100)}%`
  };
}

function buildAlertMessage(report: TreasuryCoverageReport): { title: string; body: string } {
  const f = formatFigures(report);
  if (report.light === "unknown") {
    return {
      title: "Покрытие Wallet: не удалось проверить",
      body: `Не получены данные: ${report.treasury.errors.join(", ") || "неизвестно"}. Обязательства ${f.liabilities}.`
    };
  }
  return {
    title: report.light === "red" ? "Покрытие Wallet: красный" : "Покрытие Wallet: жёлтый",
    body: `Резерв ${f.reserve}, обязательства ${f.liabilities}, покрытие ${f.ratio}, при падении TON на 30% ${f.stress}.`
  };
}

function buildDigestMessage(report: TreasuryCoverageReport): { title: string; body: string } {
  const f = formatFigures(report);
  const names: Record<string, string> = { green: "зелёный", yellow: "жёлтый", red: "красный", unknown: "не определён" };
  return {
    title: `Статус Wallet: ${names[report.light] ?? report.light}`,
    body: `Резерв ${f.reserve} (TON ${f.volatile}), обязательства ${f.liabilities}, покрытие ${f.ratio}, при падении TON на 30% ${f.stress}.`
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
