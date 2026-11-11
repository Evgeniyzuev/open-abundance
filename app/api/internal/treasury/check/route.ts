import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { buildTreasuryCoverageReport, decideTreasuryAlert, type TreasuryCoverageReport } from "@/lib/treasuryCoverage";
import { decideReserveGuard, sumJournal } from "@/lib/reserveGuard";
import { sendQueuedTelegramCopies, telegramCopiesBotToken } from "@/lib/telegramNotificationQueue";
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
 * and with one status digest per day. It never blocks withdrawals. The reserve guard adds an alert when the reserve
 * dropped by more than the withdrawal journal explains.
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
  let pushed = false;
  if ((decision.alert || decision.digest) && recipients > 0) {
    const message = decision.alert ? buildAlertMessage(report) : buildDigestMessage(report);
    const kind = decision.alert ? "alert" : "digest";
    // Alerts go out as a push and a Telegram copy. Until 2026-11-11 they were created without the push flag, so a
    // red or black light only appeared in the in-app list and went unnoticed. The daily digest stays in the list.
    const { error } = await supabase.rpc("create_notification_event_raw", {
      p_push: kind === "alert",
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
    pushed = notified;
    digestSent = !error && decision.digest;
  }

  // Reserve guard: a drop of the reserve that the withdrawal journal does not explain alerts the operators by
  // push and Telegram. Works only after migration 20261111150000 added the columns.
  const guardReady = Boolean(state && "last_ton_balance" in state);
  let guard: { unexplainedTon: number; unexplainedUsdt: number; alarm: boolean } | null = null;
  if (guardReady) {
    const since = state.last_checked_at ?? null;
    const sinceFilter = new Date((since ? Date.parse(since) : now.getTime()) - 3_600_000).toISOString();
    const [tonRows, usdtRows] = await Promise.all([
      supabase.from("ton_withdrawals").select("status,amount_ton,network_fee_reserve_ton,created_at,broadcast_at").gte("created_at", sinceFilter),
      supabase.from("ton_usdt_withdrawals").select("status,amount_usdt,created_at,broadcast_at").gte("created_at", sinceFilter)
    ]);
    // Without the journal the drop cannot be judged; skip this round instead of raising a false alarm.
    if (!tonRows.error && !usdtRows.error) {
      guard = decideReserveGuard(
        { ton: state.last_ton_balance === null || state.last_ton_balance === undefined ? null : Number(state.last_ton_balance), usdt: state.last_usdt_balance === null || state.last_usdt_balance === undefined ? null : Number(state.last_usdt_balance) },
        { ton: report.treasury.tonBalance, usdt: report.treasury.usdtBalance },
        sumJournal(tonRows.data ?? [], usdtRows.data ?? [], since)
      );
    }
    if (guard?.alarm && recipients > 0) {
      pushed = true;
      await supabase.rpc("create_notification_event_raw", {
        p_push: true,
        p_event_type: "treasury.unexplained_outflow",
        p_category: "system",
        p_source_type: "treasury",
        p_source_id: "reserve_guard",
        p_title: "Резерв: перевод не через приложение",
        p_body: `Из резерва ушло ${guard.unexplainedTon} TON и ${guard.unexplainedUsdt} USDT, которых нет в журнале выводов. Проверьте кошелёк резерва.`,
        p_deep_link: "/",
        p_recipient_user_ids: operatorIds,
        p_idempotency_key: `treasury-guard:${Math.floor(now.getTime() / 60_000)}`,
        p_metadata: { unexplainedTon: guard.unexplainedTon, unexplainedUsdt: guard.unexplainedUsdt }
      });
    }
  }

  await supabase.from("treasury_coverage_state").update({
    ...(guardReady ? {
      // A balance that could not be read keeps the previous value, so the next successful check still compares.
      ...(report.treasury.tonBalance !== null ? { last_ton_balance: report.treasury.tonBalance } : {}),
      ...(report.treasury.usdtBalance !== null ? { last_usdt_balance: report.treasury.usdtBalance } : {}),
      ...(guard?.alarm ? { last_unexplained_at: now.toISOString() } : {})
    } : {}),
    last_light: report.light,
    last_ratio: report.coverageRatio,
    last_checked_at: now.toISOString(),
    ...(notified ? { last_notified_light: report.light, last_notified_at: now.toISOString() } : {}),
    ...(digestSent ? { last_digest_at: now.toISOString() } : {}),
    // A green light resets the alert memory so the next yellow or red notifies again.
    ...(report.light === "green" ? { last_notified_light: null } : {}),
    updated_at: now.toISOString()
  }).eq("id", true);

  // Send the Telegram copies now instead of waiting for the queue.
  if (pushed) {
    const botToken = telegramCopiesBotToken();
    if (botToken) await sendQueuedTelegramCopies(supabase, botToken, 10).catch(() => undefined);
  }

  return json({ light: report.light, coverageRatio: report.coverageRatio, alertDue: decision.alert, digestDue: decision.digest, notified, digestSent, recipients, guard: guardReady ? guard : "migration_pending" }, 200);
}

const LIGHT_NAMES: Record<string, string> = { green: "зелёный", yellow: "жёлтый", red: "красный", black: "чёрный", unknown: "не определён" };

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
    title: `Покрытие Wallet: ${LIGHT_NAMES[report.light] ?? report.light}`,
    body: `Резерв ${f.reserve}, обязательства ${f.liabilities}, покрытие ${f.ratio}, при падении TON на 30% ${f.stress}.`
  };
}

function buildDigestMessage(report: TreasuryCoverageReport): { title: string; body: string } {
  const f = formatFigures(report);
  return {
    title: `Статус Wallet: ${LIGHT_NAMES[report.light] ?? report.light}`,
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
