// Server side of «Просьба через Нову»: loads what one person may see and applies the actions. The tables have no
// client policies, so every read and write here uses the service role and checks the person's role first.
import { isQaUser } from "@/lib/qaAccounts";
import { sendQueuedTelegramCopies, telegramCopiesBotToken } from "@/lib/telegramNotificationQueue";
import {
  MAX_ACTIVE_REQUESTS,
  MAX_ASKED_HELPERS,
  MAX_OPEN_SHOWN,
  MAX_REQUESTS_PER_DAY,
  canAct,
  isRequestKind,
  parseMessageText,
  parseRequestText,
  pickHelpers,
  roleFor,
  viewRequest,
  buildCollection,
  type Collection,
  type ConnectionRow,
  type MessageRow,
  type OfferRow,
  type RequestAction,
  type RequestRow,
  type RequestView
} from "@/lib/novaRequests";

type Db = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };
export type ActionResult = { ok: true; id?: string } | { ok: false; status: number; error: string; problem?: string };

const DAY_MS = 86_400_000;
const OPEN_WINDOW_DAYS = 14;
const fail = (status: number, error: string, problem?: string): ActionResult => ({ ok: false, status, error, problem });

type Copy = { ru: { title: string; body: string }; en: { title: string; body: string } };
const COPY: Record<"asked" | "ready" | "answer" | "contact" | "connected" | "message" | "reveal" | "closed", Copy> = {
  answer: { ru: { title: "Нова принесла ответ", body: "Кто-то ответил на вашу просьбу через Нову. Соединяться не обязательно." }, en: { title: "Nova brought an answer", body: "Someone answered your request through Nova. You do not have to connect." } },
  contact: { ru: { title: "Нова: у вас новый контакт", body: "Вы оба открыли имена. Теперь вы в контактах друг у друга." }, en: { title: "Nova: you have a new contact", body: "You both showed your names. You are now in each other's contacts." } },
  asked: { ru: { title: "Нова: кто-то просит о помощи", body: "Просьба без имени. Откройте и решите, можете ли помочь." }, en: { title: "Nova: someone asks for help", body: "A request without a name. Open it and decide if you can help." } },
  ready: { ru: { title: "Нова: нашёлся человек", body: "Кто-то готов помочь с вашей просьбой. Соединить вас?" }, en: { title: "Nova: someone can help", body: "A person is ready to help with your request. Connect you?" } },
  connected: { ru: { title: "Нова: вас соединили", body: "Автор просьбы согласился. Можно писать через Нову, имена скрыты." }, en: { title: "Nova: you are connected", body: "The author agreed. You can write through Nova; names stay hidden." } },
  message: { ru: { title: "Нова передала сообщение", body: "Новое сообщение по просьбе. Ответьте, когда будет удобно." }, en: { title: "Nova passed on a message", body: "A new message about the request. Answer when it suits you." } },
  reveal: { ru: { title: "Нова: собеседник готов показать имя", body: "Если вы тоже согласны, имена станут видны обоим." }, en: { title: "Nova: the other person is ready to show their name", body: "If you agree too, both names become visible." } },
  closed: { ru: { title: "Нова: разговор завершён", body: "Собеседник завершил разговор по просьбе. Спасибо за участие." }, en: { title: "Nova: the conversation ended", body: "The other person ended the conversation. Thank you for taking part." } }
};

/** One push and Telegram copy in the person's language. A failed notification never fails the action. */
async function notify(db: Db, userIds: string[], kind: keyof typeof COPY, requestId: string, key: string) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  try {
    const { data: profiles } = await db.from("user_profiles").select("user_id,default_locale").in("user_id", ids);
    const locales = new Map<string, string>((profiles ?? []).map((row: { user_id: string; default_locale: string | null }) => [row.user_id, row.default_locale === "ru" ? "ru" : "en"]));
    for (const userId of ids) {
      const copy = COPY[kind][locales.get(userId) === "ru" ? "ru" : "en"];
      await db.rpc("create_notification_event_raw", {
        p_event_type: `nova.request_${kind}`,
        p_category: "reminders",
        p_source_type: "nova_request",
        p_source_id: requestId,
        p_title: copy.title,
        p_body: copy.body,
        p_deep_link: "/",
        p_recipient_user_ids: [userId],
        p_idempotency_key: `nova_request:${requestId}:${kind}:${key}:${userId}`,
        p_metadata: {},
        p_push: true
      });
    }
    const botToken = telegramCopiesBotToken();
    if (botToken) await sendQueuedTelegramCopies(db, botToken, 10);
  } catch {
    // The request itself is saved; the person sees it next time they open the app.
  }
}

/** Everything the person may see: their own requests, connections where they help, and requests they may answer. */
export async function loadRequestsFor(db: Db, userId: string): Promise<{ available: boolean; mine: RequestView[]; helping: RequestView[]; invited: RequestView[]; collection: Collection }> {
  const empty = { available: false, mine: [] as RequestView[], helping: [] as RequestView[], invited: [] as RequestView[], collection: buildCollection([], userId) };
  const since = new Date(Date.now() - OPEN_WINDOW_DAYS * DAY_MS).toISOString();
  const [own, open, ownOffers, connections] = await Promise.all([
    db.from("nova_requests").select("*").or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`).in("status", ["open", "matched"]).order("created_at", { ascending: false }).limit(20),
    db.from("nova_requests").select("*").eq("status", "open").neq("requester_user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    db.from("nova_request_offers").select("*").eq("helper_user_id", userId).order("created_at", { ascending: false }).limit(100),
    db.from("nova_requests").select("requester_user_id,helper_user_id,kind,requester_reveal,helper_reveal").or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`).in("status", ["matched", "closed"]).not("helper_user_id", "is", null).limit(1000)
  ]);
  // Before the migration is applied the feature is simply absent.
  if (own.error || open.error || ownOffers.error) return empty;

  const requests = new Map<string, RequestRow>();
  // Test requests from QA accounts are shown only to QA accounts.
  const visibleOpen = ((open.data ?? []) as RequestRow[]).filter((row) => !isQaUser(row.requester_user_id) || isQaUser(userId));
  for (const row of [...((own.data ?? []) as RequestRow[]), ...visibleOpen]) requests.set(row.id, row);
  const ids = [...requests.keys()];
  const collection = buildCollection((connections.data ?? []) as ConnectionRow[], userId);
  if (!ids.length) return { ...empty, available: true, collection };

  const mineIds = [...requests.values()].filter((row) => row.requester_user_id === userId).map((row) => row.id);
  const matchedIds = [...requests.values()].filter((row) => row.status === "matched").map((row) => row.id);
  const openOtherIds = [...requests.values()].filter((row) => row.status === "open" && row.requester_user_id !== userId).map((row) => row.id);
  const talkIds = [...new Set([...mineIds, ...matchedIds])];
  const [requesterOffers, talk, ownAnswers] = await Promise.all([
    mineIds.length ? db.from("nova_request_offers").select("*").in("request_id", mineIds) : Promise.resolve({ data: [] }),
    talkIds.length ? db.from("nova_request_messages").select("*").in("request_id", talkIds).order("created_at", { ascending: true }).limit(500) : Promise.resolve({ data: [] }),
    openOtherIds.length ? db.from("nova_request_messages").select("*").in("request_id", openOtherIds).eq("sender_user_id", userId).limit(100) : Promise.resolve({ data: [] })
  ]);
  const messages = { data: [...((talk.data ?? []) as MessageRow[]), ...((ownAnswers.data ?? []) as MessageRow[])] };
  const offers = [...((ownOffers.data ?? []) as OfferRow[]), ...((requesterOffers.data ?? []) as OfferRow[])];

  // Names are loaded only for connections where both sides agreed to show them.
  const revealedIds = [...requests.values()].filter((row) => row.status === "matched" && row.requester_reveal && row.helper_reveal).flatMap((row) => [row.requester_user_id, row.helper_user_id ?? ""]).filter(Boolean);
  const names = new Map<string, string>();
  if (revealedIds.length) {
    const { data: profiles } = await db.from("user_profiles").select("user_id,display_name,first_name,username").in("user_id", [...new Set(revealedIds)]);
    for (const row of profiles ?? []) names.set(row.user_id, row.display_name || row.first_name || (row.username ? `@${row.username}` : ""));
  }

  const views: RequestView[] = [];
  for (const request of requests.values()) {
    const view = viewRequest({
      request,
      offers: offers.filter((offer) => offer.request_id === request.id),
      messages: ((messages.data ?? []) as MessageRow[]).filter((message) => message.request_id === request.id),
      userId,
      names
    });
    if (view) views.push(view);
  }
  return {
    available: true,
    collection,
    mine: views.filter((view) => view.role === "requester"),
    helping: views.filter((view) => view.role === "helper"),
    invited: views.filter((view) => view.role === "invited").slice(0, MAX_OPEN_SHOWN)
  };
}

export async function createRequest(db: Db, userId: string, payload: { kind?: unknown; body?: unknown }): Promise<ActionResult> {
  if (!isRequestKind(payload.kind)) return fail(400, "kind: advice, help, partner or talk.");
  const parsed = parseRequestText(payload.body);
  if ("problem" in parsed) return fail(400, parsed.problem === "contacts" ? "Remove contacts and links: Nova passes the request on without them." : "The request must be 3 to 400 characters.", parsed.problem);

  const { count, error: countError } = await db.from("nova_requests").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).in("status", ["open", "matched"]);
  if (countError) return fail(503, "Requests are not available yet.");
  if ((count ?? 0) >= MAX_ACTIVE_REQUESTS) return fail(409, "Finish or cancel one of your requests first.", "limit");
  // Withdrawing and asking again must not turn into a stream of notifications for the people Nova asks.
  const { count: today } = await db.from("nova_requests").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  if ((today ?? 0) >= MAX_REQUESTS_PER_DAY) return fail(429, "Too many requests today. Please come back tomorrow.", "limit");

  const { data: created, error } = await db.from("nova_requests").insert({ requester_user_id: userId, kind: payload.kind, body: parsed.text }).select("id").single();
  if (error || !created) return fail(500, error?.message ?? "Could not save the request.");

  // Nova asks people who agreed to introductions; everyone else sees the request in their own list.
  const { data: consented } = await db.from("user_help_profiles").select("user_id,updated_at").eq("match_consent", true).order("updated_at", { ascending: false }).limit(200);
  const lastActive = new Map<string, number>((consented ?? []).map((row: { user_id: string; updated_at: string }) => [row.user_id, Date.parse(row.updated_at) || 0]));
  const helpers = pickHelpers({ requesterId: userId, consented: (consented ?? []).map((row: { user_id: string }) => row.user_id), lastActive, excluded: isQaUser, limit: MAX_ASKED_HELPERS });
  // A request from a QA account is a test: nobody is asked and nobody is notified.
  if (helpers.length && !isQaUser(userId)) {
    await db.from("nova_request_offers").insert(helpers.map((helperId) => ({ request_id: created.id, helper_user_id: helperId, status: "asked" })));
    await notify(db, helpers, "asked", created.id, "new");
  }
  return { ok: true, id: created.id };
}

export async function actOnRequest(db: Db, userId: string, requestId: string, payload: { action?: unknown; offerId?: unknown; body?: unknown; helped?: unknown }): Promise<ActionResult> {
  const action = String(payload.action ?? "") as RequestAction;
  const { data: request, error } = await db.from("nova_requests").select("*").eq("id", requestId).maybeSingle();
  if (error) return fail(503, "Requests are not available yet.");
  if (!request) return fail(404, "Not found.");
  const row = request as RequestRow;
  const { data: ownOffer } = await db.from("nova_request_offers").select("*").eq("request_id", requestId).eq("helper_user_id", userId).maybeSingle();
  const role = roleFor(row, (ownOffer as OfferRow | null) ?? null, userId);
  // The same answer for "not yours" and "does not exist", so nobody can probe other people's requests.
  if (role === "none") return fail(404, "Not found.");
  if (!canAct(action, role, row, (ownOffer as OfferRow | null) ?? null)) return fail(409, "This step is not available now.");
  const now = new Date().toISOString();

  if (action === "can" || action === "pass") {
    const status = action === "can" ? "ready" : "passed";
    if (action === "can") {
      const { count: waiting } = await db.from("nova_request_offers").select("id", { count: "exact", head: true }).eq("request_id", requestId).eq("status", "ready");
      if ((waiting ?? 0) >= MAX_ASKED_HELPERS) return fail(409, "Enough people already answered this request.");
    }
    const { error: saveError } = await db.from("nova_request_offers").upsert({ request_id: requestId, helper_user_id: userId, status, responded_at: now }, { onConflict: "request_id,helper_user_id" });
    if (saveError) return fail(500, saveError.message);
    if (action === "can") await notify(db, [row.requester_user_id], "ready", requestId, userId);
    return { ok: true };
  }

  if (action === "answer") {
    // An answer through Nova: the author reads it without a name and without a connection. One answer per person.
    const parsed = parseMessageText(payload.body, false);
    if ("problem" in parsed) return fail(400, parsed.problem === "contacts" ? "Remove contacts and links: Nova passes the answer on without them." : "The answer must be 1 to 600 characters.", parsed.problem);
    const { count: sent } = await db.from("nova_request_messages").select("id", { count: "exact", head: true }).eq("request_id", requestId).eq("sender_user_id", userId);
    if ((sent ?? 0) > 0) return fail(409, "You already answered this request.");
    const { count: all } = await db.from("nova_request_messages").select("id", { count: "exact", head: true }).eq("request_id", requestId);
    if ((all ?? 0) >= MAX_ASKED_HELPERS * 2) return fail(409, "Enough people already answered this request.");
    const { data: saved, error: saveError } = await db.from("nova_request_messages").insert({ request_id: requestId, sender_user_id: userId, body: parsed.text }).select("id").single();
    if (saveError || !saved) return fail(500, saveError?.message ?? "Could not send.");
    // The answer also counts as «Могу», so the author may continue with this person if they want to.
    await db.from("nova_request_offers").upsert({ request_id: requestId, helper_user_id: userId, status: "ready", responded_at: now }, { onConflict: "request_id,helper_user_id" });
    await notify(db, [row.requester_user_id], "answer", requestId, userId);
    return { ok: true, id: saved.id };
  }

  if (action === "connect") {
    const offerId = typeof payload.offerId === "string" ? payload.offerId : "";
    const { data: offer } = await db.from("nova_request_offers").select("*").eq("id", offerId).eq("request_id", requestId).eq("status", "ready").maybeSingle();
    if (!offer) return fail(409, "This person is no longer waiting.");
    // The status filter makes the second consent happen once, even with two taps.
    const { data: updated, error: updateError } = await db.from("nova_requests").update({ status: "matched", helper_user_id: offer.helper_user_id, matched_at: now }).eq("id", requestId).eq("status", "open").select("id");
    if (updateError) return fail(500, updateError.message);
    if (!updated?.length) return fail(409, "This step is not available now.");
    await db.from("nova_request_offers").update({ status: "connected", responded_at: now }).eq("id", offer.id);
    await db.from("nova_request_offers").update({ status: "released" }).eq("request_id", requestId).neq("id", offer.id);
    await notify(db, [offer.helper_user_id], "connected", requestId, "once");
    return { ok: true };
  }

  if (action === "cancel") {
    await db.from("nova_requests").update({ status: "cancelled", closed_at: now, closed_by: "requester" }).eq("id", requestId).eq("status", "open");
    await db.from("nova_request_offers").update({ status: "released" }).eq("request_id", requestId);
    return { ok: true };
  }

  const other = role === "requester" ? row.helper_user_id : row.requester_user_id;

  if (action === "message") {
    const parsed = parseMessageText(payload.body, row.requester_reveal && row.helper_reveal);
    if ("problem" in parsed) return fail(400, parsed.problem === "contacts" ? "Contacts and links can be shared after both of you chose to show your names." : "The message must be 1 to 600 characters.", parsed.problem);
    const { data: saved, error: saveError } = await db.from("nova_request_messages").insert({ request_id: requestId, sender_user_id: userId, body: parsed.text }).select("id").single();
    if (saveError || !saved) return fail(500, saveError?.message ?? "Could not send.");
    // One notification per hour for a conversation, so a quick exchange does not become a stream of pushes.
    if (other) await notify(db, [other], "message", requestId, `${userId}:${Math.floor(Date.now() / 3_600_000)}`);
    return { ok: true, id: saved.id };
  }

  if (action === "reveal") {
    const already = role === "requester" ? row.requester_reveal : row.helper_reveal;
    const theirs = role === "requester" ? row.helper_reveal : row.requester_reveal;
    if (!already) {
      await db.from("nova_requests").update(role === "requester" ? { requester_reveal: true } : { helper_reveal: true }).eq("id", requestId);
      if (other && !theirs) await notify(db, [other], "reveal", requestId, userId);
      if (other && theirs) {
        // Both agreed to show names: the connection becomes a contact for each of them.
        const contact = { source: "manual", status: "active", is_required: false, removed_at: null };
        await db.from("user_contacts").upsert([{ owner_user_id: userId, contact_user_id: other, ...contact }, { owner_user_id: other, contact_user_id: userId, ...contact }], { onConflict: "owner_user_id,contact_user_id,source" });
        await notify(db, [other], "contact", requestId, "once");
      }
    }
    return { ok: true };
  }

  // close: either side leaves without explaining. Only the requester may say whether it helped.
  const helped = role === "requester" && typeof payload.helped === "boolean" ? payload.helped : null;
  if (row.status === "open") {
    // Closing without a connection is for answers through Nova: it needs at least one answer and the «помогло» reply.
    const { count: answers } = await db.from("nova_request_messages").select("id", { count: "exact", head: true }).eq("request_id", requestId);
    if (!answers || helped === null) return fail(409, "This step is not available now.");
    await db.from("nova_request_offers").update({ status: "released" }).eq("request_id", requestId);
  }
  const { data: closed } = await db.from("nova_requests").update({ status: "closed", closed_at: now, closed_by: role, ...(helped === null ? {} : { helped }) }).eq("id", requestId).eq("status", row.status).select("id");
  if (closed?.length && other && row.status === "matched") await notify(db, [other], "closed", requestId, "once");
  return { ok: true };
}
