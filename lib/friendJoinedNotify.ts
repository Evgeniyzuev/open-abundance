import { personName } from "@/lib/personName";
import { sendQueuedTelegramCopies, telegramCopiesBotToken } from "@/lib/telegramNotificationQueue";

/**
 * "Your friend joined: help them with the first step" for the person whose link brought a new member, once per new
 * member (the idempotency key), as a push and a Telegram copy. Never throws: a missed message must not fail the claim.
 */
export async function notifyFriendJoinedSafely(db: any, memberUserId: string) {
  try {
    const { data: edge } = await db.from("referral_edges").select("referrer_user_id").eq("referral_user_id", memberUserId).maybeSingle();
    if (!edge?.referrer_user_id || edge.referrer_user_id === memberUserId) return;
    const { data: profile } = await db.from("user_profiles").select("display_name,username").eq("user_id", memberUserId).maybeSingle();
    const copy = friendJoinedCopy(profile ? personName(profile, "") : "");
    const { data: eventId, error } = await db.rpc("create_notification_event_raw", {
      p_event_type: "referrals.friend_joined",
      p_category: "team",
      p_source_type: "referral_edge",
      p_source_id: memberUserId,
      p_title: copy.en.title,
      p_body: copy.en.body,
      p_deep_link: "/?view=people.teams",
      p_recipient_user_ids: [edge.referrer_user_id],
      p_idempotency_key: `friend-joined:${memberUserId}`,
      p_metadata: { copy },
      p_push: true
    });
    if (error || !eventId) return;
    const botToken = telegramCopiesBotToken();
    if (botToken) await sendQueuedTelegramCopies(db, botToken, 10);
  } catch {
    // See above.
  }
}

export function friendJoinedCopy(name: string) {
  const who = name || null;
  return {
    en: { title: who ? `${who} joined by your link` : "A friend joined by your link", body: "Help them with the first step: tell them why you are here and what has worked for you." },
    ru: { title: who ? `${who} пришёл по твоей ссылке` : "Друг пришёл по твоей ссылке", body: "Помоги с первым шагом: расскажи, зачем ты здесь и что у тебя уже получилось." },
    es: { title: who ? `${who} se unió con tu enlace` : "Un amigo se unió con tu enlace", body: "Ayúdale con el primer paso: cuéntale por qué estás aquí y qué te ha funcionado." },
    zh: { title: who ? `${who} 通过你的链接加入了` : "有朋友通过你的链接加入了", body: "帮他迈出第一步：告诉他你为什么在这里，以及你已经做成了什么。" },
    hi: { title: who ? `${who} आपके लिंक से जुड़े` : "एक दोस्त आपके लिंक से जुड़ा", body: "पहले कदम में मदद करें: बताएँ कि आप यहाँ क्यों हैं और आपके लिए क्या काम आया।" },
    ar: { title: who ? `انضم ${who} عبر رابطك` : "انضم صديق عبر رابطك", body: "ساعده في الخطوة الأولى: أخبره لماذا أنت هنا وما الذي نجح معك." }
  };
}
