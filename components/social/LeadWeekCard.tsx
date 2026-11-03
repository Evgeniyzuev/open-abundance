"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { trackProductEvent } from "@/lib/productAnalytics";
import LeadMeetingSettings from "@/components/social/LeadMeetingSettings";
import { OPEN_AI_PROMPT_EVENT } from "@/lib/noteAiClient";
import { stuckSplitPrompt } from "@/lib/leadMeetings";
import { leadMentorFor, MENTOR_KEYS, MENTORS, type MentorKey } from "@/lib/mentors";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import {
  CONTROL_PRACTICE,
  MIDWEEK_STATUSES,
  REVIEW_STATUSES,
  WEEK_GOAL_MAX,
  WEEK_NOTE_MAX,
  kitMessage,
  practiceByKey,
  type WeekPhase
} from "@/lib/leadPractices";

type Week = {
  goal: string | null;
  midweek_status: string | null;
  review_status: string | null;
  review_note: string | null;
  visibility: "private" | "lead";
};

type Payload = {
  available: boolean;
  phase: WeekPhase;
  practiceKey: string;
  week: Week | null;
  hasLiveLead: boolean;
  lead: { followers: number; kitPracticeKey: string; shared: Array<{ userId: string; name: string | null; goal: string | null; midweek: string | null; review: string | null; metRecently: boolean; wordGiven: boolean; stuck: boolean }> } | null;
};

const STATUS_ICON: Record<string, string> = { going: "🟢", stuck: "🟡", need_help: "🆘", done: "✅", partly: "◐", not_yet: "○" };

/**
 * The week with the Open Abundance lead: one goal on Monday, "how is it going?" mid-week, the result at the end,
 * with this week's practice card. No pressure: every step is optional and the person picks who sees it.
 * For live leads, also the practice of the week as a ready message for their followers.
 */
export default function LeadWeekCard({ onMessage }: { onMessage?: (userId: string) => void }) {
  const { locale, t, user, profile, applyServerData } = useUserContext();
  const [choosing, setChoosing] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [goal, setGoal] = useState("");
  const [note, setNote] = useState("");
  const [shareWithLead, setShareWithLead] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const userId = user?.id ?? null;
  const ru = locale === "ru";

  const load = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth("/api/lead-week", { cache: "no-store" }, { authRequired: true });
      if (!response.ok) return;
      setData((await response.json()) as Payload);
    } catch {
      // The card simply stays hidden.
    }
  }, []);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  if (!userId || !data?.available) return null;

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetchWithSupabaseAuth(
        "/api/lead-week",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        { authRequired: true }
      );
      if (response.ok) await load();
    } finally {
      setSaving(false);
    }
  }

  const lead = leadMentorFor(profile?.onboarding_state, profile?.created_at);
  const mentor = MENTORS[lead.key];
  const showChoice = !data.hasLiveLead && (lead.needsChoice || choosing);

  // The person picks their AI lead (lib/mentors.ts); kept in their own profile's onboarding_state.
  async function chooseMentor(key: MentorKey) {
    if (!profile) return;
    const nextState = { ...((profile.onboarding_state as Record<string, unknown> | null) ?? {}), mentor: key };
    const updatedAt = new Date().toISOString();
    applyServerData({ profile: { ...profile, onboarding_state: nextState, updated_at: updatedAt } });
    setChoosing(false);
    trackProductEvent("lead_mentor_chosen", { mentor: key, change: !lead.needsChoice });
    try {
      await getBrowserSupabaseClient().from("user_profiles").update({ onboarding_state: nextState, updated_at: updatedAt }).eq("user_id", profile.user_id);
    } catch {
      // Shown locally; saved again on the next choice.
    }
  }

  if (showChoice) {
    return (
      <section className="lead-week home-card" aria-labelledby="lead-mentor-title">
        <span className="home-card-label">{ru ? "ИИ-лид Open Abundance" : "Open Abundance AI lead"}</span>
        <h3 id="lead-mentor-title">{ru ? "Кто будет твоим наставником?" : "Who will be your mentor?"}</h3>
        <p className="lead-mentor-hint">{ru ? "Он или она поможет поставить цель недели, спросит, как идёт, и подведёт итог вместе с тобой. Сменить можно в любой момент." : "They help you set a goal for the week, ask how it goes and look at the result with you. You can change any time."}</p>
        <div className="lead-mentor-options">
          {MENTOR_KEYS.map((key) => {
            const option = MENTORS[key];
            return (
              <button key={key} type="button" className={`lead-mentor-option${key === lead.key && !lead.needsChoice ? " current" : ""}`} onClick={() => void chooseMentor(key)}>
                <img alt="" src={option.avatarUrl} />
                <strong>{option.name[ru ? "ru" : "en"]}</strong>
                <span>{option.pitch[ru ? "ru" : "en"]}</span>
              </button>
            );
          })}
        </div>
        <div className="lead-mentor-links">
          {MENTOR_KEYS.map((key) => <a key={key} href={MENTORS[key].path}>{ru ? `Профиль: ${MENTORS[key].firstName.ru}` : `${MENTORS[key].firstName.en}'s profile`}</a>)}
        </div>
      </section>
    );
  }

  const practice = data.practiceKey === CONTROL_PRACTICE ? null : practiceByKey(data.practiceKey);
  const week = data.week;
  const kit = data.lead ? practiceByKey(data.lead.kitPracticeKey) : null;
  const kitText = kit ? kitMessage(kit, locale) : "";

  async function copyKit() {
    try {
      await navigator.clipboard.writeText(kitText);
      setCopied(true);
      trackProductEvent("lead_kit_copied", { practice: kit?.key ?? "" });
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="lead-week home-card" aria-labelledby="lead-week-title">
      {data.hasLiveLead ? (
        <span className="home-card-label">{t("leadWeek.labelPractice")}</span>
      ) : (
        <span className="home-card-label lead-week-persona">
          <img alt="" src={mentor.avatarUrl} />
          {mentor.leadLabel[ru ? "ru" : "en"]}
          <button className="lead-mentor-change" type="button" onClick={() => setChoosing(true)}>{ru ? "сменить" : "change"}</button>
        </span>
      )}
      <h3 id="lead-week-title">{t("leadWeek.title")}</h3>

      {practice ? (
        <div className="lead-week-practice">
          <strong>{ru ? practice.title.ru : practice.title.en}</strong>
          <p>{ru ? practice.how.ru : practice.how.en}</p>
          <small>{practice.source}</small>
        </div>
      ) : null}

      {!week?.goal ? (
        <form
          className="lead-week-goal"
          onSubmit={(event) => {
            event.preventDefault();
            if (goal.trim()) void save({ action: "goal", goal, visibility: shareWithLead ? "lead" : "private" });
          }}
        >
          <label className="finance-field">
            <span>{t("leadWeek.goalLabel")}</span>
            <input maxLength={WEEK_GOAL_MAX} value={goal} placeholder={t("leadWeek.goalPlaceholder")} onChange={(event) => setGoal(event.target.value)} />
          </label>
          {data.hasLiveLead ? (
            <label className="help-profile-consent">
              <input type="checkbox" checked={shareWithLead} onChange={(event) => setShareWithLead(event.target.checked)} />
              <span>{t("leadWeek.shareWithLead")}</span>
            </label>
          ) : null}
          <button className="secondary-button" type="submit" disabled={saving || !goal.trim()}>{t("leadWeek.saveGoal")}</button>
        </form>
      ) : (
        <p className="lead-week-current"><b>{t("leadWeek.yourGoal")}</b> {week.goal}</p>
      )}

      {week?.goal && !week.review_status && data.phase === "midweek" && !week.midweek_status ? (
        <div className="lead-week-step">
          <p>{t("leadWeek.midweekQuestion")}</p>
          <div className="chips">
            {MIDWEEK_STATUSES.map((status) => (
              <button className="chip" key={status} type="button" disabled={saving} onClick={() => void save({ action: "midweek", status })}>
                {t(`leadWeek.midweek.${status}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {week?.midweek_status === "stuck" && !week.review_status ? (
        <div className="lead-meeting-stuck">
          <p>{t("leadWeek.stuckHint")}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              trackProductEvent("lead_stuck_split", { status: "week_stuck" });
              window.dispatchEvent(new CustomEvent(OPEN_AI_PROMPT_EVENT, { detail: { text: stuckSplitPrompt(week.goal, locale) } }));
            }}
          >
            {t("leadMeeting.stuckSplit")}
          </button>
        </div>
      ) : null}
      {week?.midweek_status === "need_help" && !week.review_status ? <p>{t("leadWeek.helpHint")}</p> : null}

      {week?.goal && !week.review_status && data.phase === "review" ? (
        <div className="lead-week-step">
          <p>{t("leadWeek.reviewQuestion")}</p>
          <input className="lead-week-note" maxLength={WEEK_NOTE_MAX} value={note} placeholder={t("leadWeek.notePlaceholder")} onChange={(event) => setNote(event.target.value)} />
          <div className="chips">
            {REVIEW_STATUSES.map((status) => (
              <button className="chip" key={status} type="button" disabled={saving} onClick={() => void save({ action: "review", status, note })}>
                {t(`leadWeek.review.${status}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {week?.review_status ? <p role="status">{t("leadWeek.reviewed")}</p> : null}

      <LeadMeetingSettings />

      {data.lead?.shared.length ? (
        <div className="lead-week-people">
          <strong>{t("leadWeek.peopleTitle")}</strong>
          <ul className="lead-week-followers">
            {data.lead.shared.map((item) => (
              <li key={item.userId}>
                <strong>{item.name ?? t("leadWeek.follower")}</strong>
                <span>{item.goal ?? "—"} <span aria-hidden="true">{[item.midweek, item.review].filter(Boolean).map((status) => STATUS_ICON[String(status)] ?? "").join(" ")}</span></span>
                <span>
                  {[
                    item.stuck ? t("leadWeek.people.stuck") : null,
                    item.metRecently ? t("leadWeek.people.met") : t("leadWeek.people.notMet"),
                    item.wordGiven ? t("leadWeek.people.word") : null
                  ].filter(Boolean).join(" · ")}
                </span>
                {onMessage ? (
                  <button className="text-button" type="button" onClick={() => { trackProductEvent("lead_people_message", { stuck: item.stuck }); onMessage(item.userId); }}>
                    {item.stuck ? t("leadWeek.people.helpButton") : t("leadWeek.people.writeButton")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.lead && kit ? (
        <details className="lead-week-kit">
          <summary>{t("leadWeek.kitTitle", { count: data.lead.followers })}</summary>
          <p>{kitText}</p>
          <button className="secondary-button" type="button" onClick={() => void copyKit()}>{copied ? t("leadWeek.kitCopied") : t("leadWeek.kitCopy")}</button>
          {data.lead.shared.length ? null : <p>{t("leadWeek.kitNoShared")}</p>}
        </details>
      ) : null}
    </section>
  );
}
