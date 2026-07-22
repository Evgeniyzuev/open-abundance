import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type ReminderJob = {
  id: string;
  subscription_id: string;
  kind: "action" | "today_daily";
  locale: "ru" | "en";
  deep_link: string;
  timezone: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  owner_key: string;
};

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "mailto:admin@open-abundance.app";
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return new Response("Reminder secrets are not configured", { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: jobs, error: claimError } = await supabase.rpc("claim_due_reminder_jobs", { p_limit: 100 });
  if (claimError) return new Response(claimError.message, { status: 500 });

  let sent = 0;
  for (const job of (jobs ?? []) as ReminderJob[]) {
    const { data: subscription, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,owner_key")
      .eq("id", job.subscription_id)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      await finishJob(supabase, job.id, false, subscriptionError?.message ?? "Subscription not found");
      continue;
    }

    try {
      const pushSubscription = subscription as PushSubscriptionRow;
      if (job.kind === "today_daily" && await isTodayComplete(supabase, pushSubscription.owner_key, job.timezone)) {
        await finishJob(supabase, job.id, true, null);
        continue;
      }
      await webpush.sendNotification({
        endpoint: pushSubscription.endpoint,
        keys: { p256dh: pushSubscription.p256dh, auth: pushSubscription.auth }
      }, JSON.stringify(buildPayload(job)), { TTL: 3600 });
      await finishJob(supabase, job.id, true, null);
      await supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", job.subscription_id);
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").update({ enabled: false }).eq("id", job.subscription_id);
        await supabase.from("reminder_jobs").update({ status: "failed", last_error: "Push subscription expired" }).eq("id", job.id);
        continue;
      }
      await finishJob(supabase, job.id, false, error instanceof Error ? error.message : "Push delivery failed");
    }
  }

  return Response.json({ claimed: jobs?.length ?? 0, sent });
});

function buildPayload(job: ReminderJob) {
  const isRussian = job.locale === "ru";
  return {
    title: job.kind === "today_daily"
      ? (isRussian ? "Ваш личный план на сегодня готов" : "Your personal plan for today is ready")
      : (isRussian ? "У вас есть запланированное действие" : "You have a planned action"),
    body: isRussian ? "Откройте приложение, чтобы увидеть детали." : "Open the app to see the details.",
    deepLink: job.deep_link,
    tag: `open-abundance-reminder:${job.id}`
  };
}

async function isTodayComplete(supabase: ReturnType<typeof createClient>, ownerKey: string, timezone: string): Promise<boolean> {
  if (!ownerKey.startsWith("user:")) return false;
  const userId = ownerKey.slice("user:".length);
  const localDate = getLocalDate(new Date(), timezone);
  const { data, error } = await supabase
    .from("user_today_instances")
    .select("status")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .maybeSingle();
  return !error && data?.status === "completed";
}

function getLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function finishJob(supabase: ReturnType<typeof createClient>, jobId: string, success: boolean, error: string | null) {
  await supabase.rpc("complete_reminder_job", { p_job_id: jobId, p_success: success, p_error: error });
}
