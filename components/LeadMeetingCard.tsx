"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { OPEN_AI_PROMPT_EVENT } from "@/lib/noteAiClient";
import { trackProductEvent } from "@/lib/productAnalytics";
import WordPledgePanel from "@/components/WordPledgePanel";
import { SMALL_WISHES, smallWishText } from "@/lib/smallWishes";
import {
  MEETING_GOAL_STATUSES,
  MEETING_RHYTHMS,
  MEETING_TEXT_MAX,
  meetingChatPrompt,
  stuckSplitPrompt,
  type MeetingGoalStatus,
  type MeetingRhythm,
  type RhythmSuggestion
} from "@/lib/leadMeetings";

type MeetingState = {
  available: boolean;
  rhythm: MeetingRhythm | null;
  suggestion: RhythmSuggestion | null;
  due: boolean;
  metToday: boolean;
  nextDay: string | null;
  lastGoal: string | null;
  weekGoal: string | null;
  questsSince: string[];
  smallWish: { key: string } | null;
};

async function loadMeeting(locale: string): Promise<MeetingState | null> {
  try {
    const response = await fetchWithSupabaseAuth(`/api/lead-meeting?locale=${locale}`, { cache: "no-store" }, { authRequired: true });
    if (!response.ok) return null;
    const payload = (await response.json()) as MeetingState;
    return payload.available ? payload : null;
  } catch {
    return null;
  }
}

async function saveMeeting(body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseAuth(
      "/api/lead-meeting",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { authRequired: true }
    );
    return response.ok;
  } catch {
    return false;
  }
}

function formatDay(day: string | null, locale: string): string {
  if (!day) return "";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

/** Rhythm buttons, shared by the Home card and the team tab. */
export function MeetingRhythmPicker({ current, onPicked }: { current: MeetingRhythm | null; onPicked: (rhythm: MeetingRhythm) => void }) {
  const { t } = useUserContext();
  const [saving, setSaving] = useState(false);
  return (
    <div className="chips lead-meeting-rhythm">
      {MEETING_RHYTHMS.map((rhythm) => (
        <button
          aria-pressed={current === rhythm}
          className="chip"
          disabled={saving}
          key={rhythm}
          type="button"
          onClick={async () => {
            setSaving(true);
            if (await saveMeeting({ action: "rhythm", rhythm })) onPicked(rhythm);
            setSaving(false);
          }}
        >
          {t(`leadMeeting.rhythm.${rhythm}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

const SMALL_WISH_DISMISS_KEY = "oa.meetingSmallWish.until";

/**
 * A gentle nudge after the meeting: one small wish (help from people or a habit) for the week, for someone without one
 * in progress. One tap adds it to their wishes; "Not now" hides it for a week.
 */
function MeetingSmallWish({ offerKey }: { offerKey: string | null }) {
  const { locale, t } = useUserContext();
  const [state, setState] = useState<"idle" | "adding" | "added" | "hidden">(() => {
    try {
      return Number(window.localStorage.getItem(SMALL_WISH_DISMISS_KEY) ?? 0) > Date.now() ? "hidden" : "idle";
    } catch {
      return "idle";
    }
  });
  const wish = SMALL_WISHES.find((item) => item.key === offerKey);
  if (!wish || state === "hidden") return null;

  async function add() {
    if (!wish) return;
    setState("adding");
    const response = await fetchWithSupabaseAuth("/api/wishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: smallWishText(wish.title, locale),
        description: `${smallWishText(wish.description, locale)}\n\n${smallWishText(wish.fulfil, locale)}`,
        category: wish.category,
        imageUrl: "",
        targetAmount: "",
        targetCurrency: "USD",
        difficultyLevel: "1",
        visibility: "private",
        publishToFeed: false,
        sourceRecommendedWishId: null
      })
    }, { authRequired: true }).catch(() => null);
    if (response?.ok) {
      trackProductEvent("small_wish_added", { key: wish.key, kind: wish.kind, price: 0, source: "lead_meeting" });
      setState("added");
    } else {
      setState("idle");
    }
  }

  return (
    <div className="lead-meeting-small-wish">
      <p>{state === "added" ? t("leadMeeting.smallWishAdded") : t("leadMeeting.smallWishOffer", { wish: `${wish.emoji} ${smallWishText(wish.title, locale)}` })}</p>
      {state === "added" ? null : (
        <div className="chips">
          <button className="chip" type="button" disabled={state === "adding"} onClick={() => void add()}>{t("leadMeeting.smallWishAdd")}</button>
          <button
            className="chip"
            type="button"
            onClick={() => {
              try {
                window.localStorage.setItem(SMALL_WISH_DISMISS_KEY, String(Date.now() + 7 * 86_400_000));
              } catch {
                // Hidden for this visit only.
              }
              trackProductEvent("small_wish_offer_dismissed", { key: wish.key, source: "lead_meeting" });
              setState("hidden");
            }}
          >
            {t("leadMeeting.smallWishLater")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The one-tap "Suits me" for the lead's proposed rhythm. */
function MeetingRhythmAccept({ rhythm, onPicked }: { rhythm: MeetingRhythm; onPicked: (rhythm: MeetingRhythm) => void }) {
  const { t } = useUserContext();
  const [saving, setSaving] = useState(false);
  return (
    <button
      className="chip"
      aria-pressed="true"
      disabled={saving}
      type="button"
      onClick={async () => {
        setSaving(true);
        if (await saveMeeting({ action: "rhythm", rhythm })) onPicked(rhythm);
        setSaving(false);
      }}
    >
      {t("leadMeeting.acceptRhythm")}
    </button>
  );
}

/**
 * The meeting with the lead on Home: two minutes on meeting days. What moved since last time, how the last goal went,
 * a question or wish, and one goal for the next meeting; then the chat with Nova continues from it. The lead proposes
 * the rhythm first and the person accepts or picks another; "Not now" turns meetings off, and the team tab can turn
 * them back on. A meeting stays open until the next meeting day, so the person answers in their own time. After the
 * meeting the person may give their word on a quest (WordPledgePanel).
 */
export default function LeadMeetingCard({ active }: { active: boolean }) {
  const { locale, t, user } = useUserContext();
  const [state, setState] = useState<MeetingState | null>(null);
  const [status, setStatus] = useState<MeetingGoalStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [nextGoal, setNextGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [otherRhythm, setOtherRhythm] = useState(false);
  const userId = user?.id ?? null;

  const refresh = useCallback(async () => setState(await loadMeeting(locale)), [locale]);

  useEffect(() => {
    if (active && userId) void refresh();
  }, [active, userId, refresh]);

  if (!userId || !state) return null;

  if (!state.rhythm) {
    // The lead proposes when and how to meet; the person takes it or picks another pace.
    const suggestion = state.suggestion;
    const picked = (rhythm: MeetingRhythm, source: string) => { trackProductEvent("lead_meeting_rhythm_home", { rhythm, source }); void refresh(); };
    return (
      <section className="lead-meeting home-card" aria-labelledby="lead-meeting-title">
        <span className="home-card-label">{t("leadMeeting.label")}</span>
        {suggestion ? (
          <>
            <h3 id="lead-meeting-title">{t("leadMeeting.proposeTitle", { rhythm: t(`leadMeeting.rhythm.${suggestion.rhythm}` as MessageKey).toLowerCase() })}</h3>
            <p>{t(`leadMeeting.proposeReason.${suggestion.reason}` as MessageKey)} {t("leadMeeting.proposeHow")}</p>
            {otherRhythm ? (
              <MeetingRhythmPicker current={null} onPicked={(rhythm) => picked(rhythm, "other")} />
            ) : (
              <div className="chips">
                <MeetingRhythmAccept rhythm={suggestion.rhythm} onPicked={(rhythm) => picked(rhythm, "suggested")} />
                <button className="chip" type="button" onClick={() => setOtherRhythm(true)}>{t("leadMeeting.otherRhythm")}</button>
              </div>
            )}
          </>
        ) : (
          <>
            <h3 id="lead-meeting-title">{t("leadMeeting.chooseTitle")}</h3>
            <p>{t("leadMeeting.chooseBody")}</p>
            <MeetingRhythmPicker current={null} onPicked={(rhythm) => picked(rhythm, "picker")} />
          </>
        )}
      </section>
    );
  }
  if (state.rhythm === "off") return null;

  if (finished || !state.due) {
    if (!finished) return <WordPledgePanel mode="status" nextMeetingDay={state.nextDay} standalone />;
    return (
      <section className="lead-meeting home-card" aria-live="polite">
        <span className="home-card-label">{t("leadMeeting.label")}</span>
        <p>{t("leadMeeting.done", { day: formatDay(state.nextDay, locale) })}</p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AI_PROMPT_EVENT, {
            detail: { text: meetingChatPrompt({ progress: state.questsSince, lastGoal: state.lastGoal, status, question, nextGoal }, locale) }
          }))}
        >
          {t("leadMeeting.discuss")}
        </button>
        <WordPledgePanel mode="offer" nextMeetingDay={state.nextDay} />
        <MeetingSmallWish offerKey={state.smallWish?.key ?? null} />
      </section>
    );
  }
  async function finish() {
    if (!state) return;
    setSaving(true);
    const ok = await saveMeeting({ action: "meeting", lastGoalStatus: status, question, nextGoal, questsSince: state.questsSince.length });
    setSaving(false);
    if (ok) setFinished(true);
  }

  return (
    <section className="lead-meeting home-card" aria-labelledby="lead-meeting-title">
      <span className="home-card-label">{t("leadMeeting.label")}</span>
      <h3 id="lead-meeting-title">{t("leadMeeting.title")}</h3>
      <p>
        {state.questsSince.length
          ? t("leadMeeting.progress", { count: state.questsSince.length, list: state.questsSince.slice(0, 3).join(", ") })
          : t("leadMeeting.noProgress")}
      </p>
      {state.weekGoal ? <p>{t("leadMeeting.weekGoal", { goal: state.weekGoal })}</p> : null}
      <WordPledgePanel mode="status" nextMeetingDay={state.nextDay} />
      {state.lastGoal ? (
        <div className="lead-meeting-step">
          <p>{t("leadMeeting.lastGoal", { goal: state.lastGoal })}</p>
          <div className="chips">
            {MEETING_GOAL_STATUSES.map((item) => (
              <button aria-pressed={status === item} className="chip" key={item} type="button" onClick={() => setStatus(item)}>
                {t(`leadWeek.review.${item}` as MessageKey)}
              </button>
            ))}
          </div>
          {status === "not_yet" || status === "partly" ? (
            <div className="lead-meeting-stuck">
              <p>{t("leadMeeting.stuckHelp")}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  trackProductEvent("lead_stuck_split", { status });
                  window.dispatchEvent(new CustomEvent(OPEN_AI_PROMPT_EVENT, { detail: { text: stuckSplitPrompt(state.lastGoal, locale) } }));
                }}
              >
                {t("leadMeeting.stuckSplit")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <label className="finance-field">
        <span>{t("leadMeeting.question")}</span>
        <input maxLength={MEETING_TEXT_MAX} value={question} placeholder={t("leadMeeting.questionPlaceholder")} onChange={(event) => setQuestion(event.target.value)} />
      </label>
      <label className="finance-field">
        <span>{t("leadMeeting.nextGoal")}</span>
        <input maxLength={MEETING_TEXT_MAX} value={nextGoal} placeholder={t("leadMeeting.nextGoalPlaceholder")} onChange={(event) => setNextGoal(event.target.value)} />
      </label>
      <button className="task-done-primary-button" type="button" disabled={saving} onClick={() => void finish()}>{t("leadMeeting.finish")}</button>
    </section>
  );
}
