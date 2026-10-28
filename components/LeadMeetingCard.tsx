"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { OPEN_AI_PROMPT_EVENT } from "@/lib/noteAiClient";
import { trackProductEvent } from "@/lib/productAnalytics";
import WordPledgePanel from "@/components/WordPledgePanel";
import {
  MEETING_GOAL_STATUSES,
  MEETING_RHYTHMS,
  MEETING_TEXT_MAX,
  meetingChatPrompt,
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
