import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type ReminderJob = {
  id: string;
  subscription_id: string;
  kind: "action" | "inbox_review";
  locale: "ru" | "en";
  deep_link: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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
      .select("id,endpoint,p256dh,auth")
      .eq("id", job.subscription_id)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      await finishJob(supabase, job.id, false, subscriptionError?.message ?? "Subscription not found");
      continue;
    }

    try {
      const pushSubscription = subscription as PushSubscriptionRow;
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
  const inbox = job.kind === "inbox_review";
  return {
    title: inbox
      ? (isRussian ? "Время разобрать входящие" : "Time to process your inbox")
      : (isRussian ? "У вас есть запланированное действие" : "You have a planned action"),
    body: isRussian ? "Откройте приложение, чтобы увидеть детали." : "Open the app to see the details.",
    deepLink: job.deep_link,
    tag: `reflection-reminder:${job.id}`
  };
}

async function finishJob(supabase: ReturnType<typeof createClient>, jobId: string, success: boolean, error: string | null) {
  await supabase.rpc("complete_reminder_job", { p_job_id: jobId, p_success: success, p_error: error });
}
