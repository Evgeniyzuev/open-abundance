"use client";

import { ArrowRight, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { questTitle, similarQuestForPost, type FeedQuest, type FeedQuestData } from "@/lib/feedQuests";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import type { FeedPost } from "@/lib/socialFeed";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const CACHE_MS = 60_000;
let cached: { userId: string; at: number; promise: Promise<FeedQuestData | null> } | null = null;

/** The viewer's quests, shared by every card in the feed and kept for a minute. */
function loadFeedQuests(userId: string): Promise<FeedQuestData | null> {
  if (cached && cached.userId === userId && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = fetchWithSupabaseAuth(`/api/challenges?auth=required&ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true })
    .then(async (response) => {
      const payload = await response.json() as { challenges?: FeedQuest[]; viewerLevel?: number; viewerUserId?: string | null; quest?: { activeId?: string | null } };
      if (!response.ok || payload.viewerUserId !== userId) return null;
      return { challenges: payload.challenges ?? [], viewerLevel: Number(payload.viewerLevel ?? 1), activeId: payload.quest?.activeId ?? null };
    })
    .catch(() => null);
  cached = { userId, at: Date.now(), promise };
  return promise;
}

function useFeedQuests(userId: string | null): FeedQuestData | null {
  const [data, setData] = useState<FeedQuestData | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadFeedQuests(userId).then((next) => { if (!cancelled) setData(next); });
    return () => { cancelled = true; };
  }, [userId]);
  return userId ? data : null;
}

/** Opens the Quests tab on this quest (AppNavigation listens for "oa:open-tab"). */
export function openFeedQuest(quest: FeedQuest, from: "story" | "swipe" | "quest_of_day"): void {
  cached = null;
  void trackClientEvent("feed_quest_opened", { challenge_id: quest.id, verification_logic: quest.verification_logic, from });
  window.dispatchEvent(new CustomEvent("oa:open-tab", { detail: { main: "challenges", challengeId: quest.id } }));
}

function QuestLine({ locale, quest, t }: { locale: AppLocale; quest: FeedQuest; t: TFunction }) {
  return (
    <span className="feed-quest-line">
      <strong>{questTitle(quest, locale)}</strong>
      {quest.core_reward_amount > 0 ? <small>{t("social.feed.questReward", { amount: formatRoundedMoney(quest.core_reward_amount, locale) })}</small> : null}
    </span>
  );
}

/** The end of a story: the person's similar first step (or their next step when the similar one is done). */
export function SimilarQuestCard({ currentUserId, locale, post, t, onBeforeOpen }: {
  currentUserId: string | null;
  locale: AppLocale;
  post: FeedPost;
  t: TFunction;
  onBeforeOpen: () => void;
}) {
  const data = useFeedQuests(currentUserId);
  const match = data ? similarQuestForPost(post, data) : null;
  if (!match) return null;
  return (
    <button className="feed-quest-card" type="button" onClick={() => { onBeforeOpen(); openFeedQuest(match.quest, "story"); }}>
      <Target size={20} aria-hidden="true" />
      <span className="feed-quest-text">
        <em>{t(match.similar ? "social.feed.similarStep" : "social.feed.nextStep")}</em>
        <QuestLine locale={locale} quest={match.quest} t={t} />
      </span>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}

/** After a right swipe ("interesting"): the similar step for the story that was just swiped. */
export function useSimilarQuest(currentUserId: string | null): (post: FeedPost) => FeedQuest | null {
  const data = useFeedQuests(currentUserId);
  return (post) => (data ? similarQuestForPost(post, data)?.quest ?? null : null);
}
