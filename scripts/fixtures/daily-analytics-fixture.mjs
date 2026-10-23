// Made-up snapshot for `pnpm analytics:daily --fixtures` and the contract test. Deterministic: the same `now`
// gives the same data. Shapes follow TABLE_SPECS in lib/dailyAnalytics.ts; nothing here is real.
const DAY = 86_400_000;

function rng(seed) {
  let value = seed;
  return () => {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648;
    return value / 2_147_483_648;
  };
}

export function buildFixtureSnapshot(now = Date.parse("2026-10-23T06:00:00Z")) {
  const random = rng(42);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const users = Array.from({ length: 40 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  const tables = {
    user_profiles: [], core_accounts: [], wallet_accounts: [], user_economy_metrics: [], wishes: [], skills: [], user_skills: [],
    user_help_profiles: [], user_spend_intents: [], feed_posts: [], feed_post_comments: [], feed_post_likes: [], challenges: [],
    user_challenges: [], challenge_feedback_submissions: [], peer_review_answers: [], referral_edges: [], humanity_verifications: [],
    marketplace_listings: [], marketplace_deals: [], wallet_ledger: [], product_events: [], ai_usage_events: [], user_feedback: [],
    push_subscriptions: [], direct_messages: [], user_follows: [], telegram_accounts: [], coordinator_recommendations: [],
    recommended_wishes: [{ id: "rw-1", title: { ru: "Выучить английский", en: "Learn English" }, category: "learning" }]
  };
  const challengeIds = ["ch-wish", "ch-passport", "ch-invite", "ch-sale"];
  tables.challenges = challengeIds.map((id, index) => ({
    id, title: { ru: ["Первое желание", "Паспорт навыков", "Пригласи друга", "Первая продажа"][index] }, track_key: ["start", "skills", "growth", "business"][index],
    category: "growth", verification_type: index === 1 ? "auto" : "system", core_reward_amount: 1, wallet_reward_amount: 0, is_active: true
  }));
  tables.skills = [{ id: "sk-1", slug: "writing" }, { id: "sk-2", slug: "design" }, { id: "sk-3", slug: "sales" }];

  users.forEach((id, index) => {
    const createdAgo = (index % 30) * DAY + 3_600_000;
    const engaged = index % 3 !== 0;
    tables.user_profiles.push({ user_id: id, created_at: iso(createdAgo), default_locale: index % 4 ? "ru" : "en", timezone: "Europe/Moscow", level: 1 + (index % 5), deleted_at: null });
    tables.core_accounts.push({ user_id: id, balance: engaged ? Number((random() * 20).toFixed(2)) : 0, level: 1 });
    tables.wallet_accounts.push({ user_id: id, balance: Number((random() * 5).toFixed(2)) });
    tables.user_economy_metrics.push({ user_id: id, core_growth_challenge_rewards: engaged ? 2 : 0, core_growth_leader_bonus: index % 10 === 0 ? 1 : 0, core_growth_reinvest: 0.1, core_growth_wallet_topups: index % 7 === 0 ? 5 : 0, core_growth_other_system: 1 });
    if (index % 5 !== 4) {
      tables.wishes.push({
        id: `w-${index}`, owner_user_id: id, title: `Желание ${index}`, category: pick(["travel", "learning", "health", "home", "learning"]),
        status: index % 9 === 0 ? "completed" : "active", visibility: index % 2 ? "public" : "private", source_recommended_wish_id: index % 6 === 0 ? "rw-1" : null,
        target_amount: index % 3 === 0 ? 100 * (1 + (index % 4)) : null, created_at: iso(createdAgo - 1000), completed_at: index % 9 === 0 ? iso(2 * DAY) : null, deleted_at: null
      });
    }
    if (engaged) {
      tables.user_challenges.push({ user_id: id, challenge_id: pick(challengeIds), status: index % 4 === 0 ? "accepted" : "completed", created_at: iso(Math.min(createdAgo, 6 * DAY)), updated_at: iso(index % 4 === 0 ? 5 * DAY : DAY) });
      tables.user_skills.push({ user_id: id, skill_id: pick(["sk-1", "sk-2", "sk-3"]), earned_skill_level: 1 + (index % 3), status: index % 2 ? "verified" : "unverified" });
    }
    if (index % 2 === 0) {
      tables.user_help_profiles.push({ user_id: id, offers: index % 4 ? ["writing"] : ["design", "local_help"], needs: index % 3 ? ["feedback"] : ["first_client", "skill_teacher"], match_consent: index % 4 !== 2 });
    }
    if (index % 3 === 1) tables.user_spend_intents.push({ user_id: id, categories: index % 2 ? ["groceries", "education"] : ["groceries"], offers_consent: index % 2 === 1 });
    if (index > 0 && index % 4 === 0) tables.referral_edges.push({ referrer_user_id: users[index - 1], referral_user_id: id, claimed_at: iso(createdAgo), source: pick(["link", "telegram"]) });
    tables.humanity_verifications.push({ user_id: id, humanity_level: index % 3 === 0 ? 2 : 1, verified_at: iso(createdAgo) });
    for (let day = 0; day < Math.min(14, createdAgo / DAY); day += engaged ? 1 : 5) {
      tables.product_events.push({ user_id: id, anonymous_id: null, event_name: "app_open", occurred_at: iso(day * DAY + index * 60_000), properties: {} });
      if (engaged) tables.product_events.push({ user_id: id, anonymous_id: null, event_name: "feed_post_impression", occurred_at: iso(day * DAY + 120_000), properties: { post_id: `p-${day}` } });
    }
    if (index % 5 === 0) tables.product_events.push({ user_id: id, anonymous_id: null, event_name: "wish_outcome_answered", occurred_at: iso(DAY), properties: { answer: index % 10 ? "helped" : "not_yet" } });
    if (engaged && index % 3 === 1) tables.product_events.push({ user_id: id, anonymous_id: null, event_name: "daily_combo_completed", occurred_at: iso(2 * DAY), properties: {} });
    if (index % 6 === 0) tables.ai_usage_events.push({ user_id: id, capability: "chat.general", status: "accepted", created_at: iso(DAY) });
  });

  for (let guest = 0; guest < 25; guest += 1) {
    const at = iso(guest * DAY + 1000);
    tables.product_events.push({ user_id: null, anonymous_id: `guest-${guest}`, event_name: "onboarding_viewed", occurred_at: at, properties: {} });
    if (guest % 2 === 0) tables.product_events.push({ user_id: null, anonymous_id: `guest-${guest}`, event_name: "onboarding_auth_started", occurred_at: at, properties: {} });
    if (guest % 3 === 0) tables.product_events.push({ user_id: null, anonymous_id: `guest-${guest}`, event_name: "onboarding_completed", occurred_at: at, properties: {} });
  }

  for (let post = 0; post < 12; post += 1) {
    const author = users[post * 3];
    tables.feed_posts.push({ id: `p-${post}`, author_user_id: author, post_type: pick(["daily_progress", "wish_created", "note"]), visibility: post % 3 ? "public" : "contacts", status: "published", source_key: null, repost_of_post_id: null, created_at: iso(post * DAY), deleted_at: null });
    tables.feed_post_comments.push({ id: `c-${post}`, post_id: `p-${post}`, user_id: users[post + 1], body: "Классно, держись!", created_at: iso(post * DAY), deleted_at: null });
    tables.feed_post_likes.push({ post_id: `p-${post}`, user_id: users[post + 2], created_at: iso(post * DAY) });
  }
  tables.marketplace_listings = [
    { id: "l-1", seller_user_id: users[2], title: "Корректура текста", status: "active", price_amount: 5, currency_code: "USD", sales_count: 1, metadata: {}, created_at: iso(3 * DAY) },
    { id: "l-2", seller_user_id: users[5], title: "Логотип за вечер", status: "active", price_amount: 15, currency_code: "USD", sales_count: 0, metadata: { guest_review: { status: "pending", flags: ["contacts"], checkedAt: iso(DAY) } }, created_at: iso(DAY) }
  ];
  tables.marketplace_deals = [{ id: "d-1", listing_id: "l-1", buyer_user_id: users[8], seller_user_id: users[2], status: "completed", price_amount: 5, currency_code: "USD", created_at: iso(2 * DAY), completed_at: iso(DAY) }];
  tables.wallet_ledger = [
    { user_id: users[8], operation_type: "marketplace_purchase", direction: "debit", amount: 5, created_at: iso(DAY) },
    { user_id: users[2], operation_type: "marketplace_sale", direction: "credit", amount: 4.9, created_at: iso(DAY) },
    { user_id: users[4], operation_type: "challenge_reward", direction: "credit", amount: 1, created_at: iso(2 * DAY) }
  ];
  tables.user_feedback = [
    { user_id: users[3], category: "confusing", message: "Не понял, где вывести деньги", screen: "wallet", created_at: iso(DAY) },
    { user_id: users[6], category: "idea", message: "Хочу напоминание про желание по утрам", screen: "wishes", created_at: iso(3 * DAY) }
  ];
  tables.peer_review_answers = [{ status: "offered", created_at: iso(DAY), submitted_at: null }, { status: "submitted", created_at: iso(2 * DAY), submitted_at: iso(DAY) }];
  tables.push_subscriptions = [{ enabled: true }, { enabled: true }, { enabled: false }];
  tables.direct_messages = [{ sender_user_id: users[1], conversation_id: "cv-1", created_at: iso(DAY) }];
  tables.user_follows = [{ follower_user_id: users[1], followee_user_id: users[2], created_at: iso(DAY) }];
  tables.telegram_accounts = [{ user_id: users[1] }];
  tables.coordinator_recommendations = [{ kind: "outreach", status: "proposed", source: "rules", outcome: null, created_at: iso(DAY), decided_at: null }];

  return { asOf: new Date(now).toISOString(), windowDays: 45, truncated: [], missing: [], tables };
}
