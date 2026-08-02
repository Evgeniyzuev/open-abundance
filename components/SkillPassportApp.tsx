"use client";

import { Activity, Check, CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { PassportSkill, SkillPassportPayload, SkillVerificationLogic } from "@/lib/skills";
import { skillTranslate } from "@/lib/skillsI18n";
import styles from "@/components/SkillPassportApp.module.css";
import { useUserContext } from "@/components/UserProvider";

const logicMessageKey: Record<SkillVerificationLogic, "referralCount" | "publicPostCount" | "teamMemberCount" | "teamContactCount" | "challengeCompletionCount"> = {
  referral_count: "referralCount",
  public_post_count: "publicPostCount",
  team_member_count: "teamMemberCount",
  team_contact_count: "teamContactCount",
  challenge_completion_count: "challengeCompletionCount"
};

export default function SkillPassportApp() {
  const { user, core, locale } = useUserContext();
  const [payload, setPayload] = useState<SkillPassportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const st = useCallback((key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => skillTranslate(locale, key, values), [locale]);
  const loadPassport = useCallback(async (showMessage = false) => {
    if (!user) return;
    setLoading(true);
    setRefreshing(showMessage);
    setError(null);
    if (showMessage) setMessage(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/skills?locale=${locale}&ts=${Date.now()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
      });
      const nextPayload = (await response.json()) as SkillPassportPayload;
      if (!response.ok || nextPayload.error) throw new Error(nextPayload.error ?? st("error"));
      setPayload(nextPayload);
      if (showMessage) setMessage(st("refreshed"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : st("error"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale, st, user]);

  useEffect(() => {
    void loadPassport();
  }, [loadPassport]);

  if (!user) return null;

  return (
    <section className={styles.passport} aria-labelledby="skill-passport-title">
      <header className={styles.header}>
        <div className={styles.icon}><Sparkles size={18} /></div>
        <div className={styles.headingCopy}>
          <h2 id="skill-passport-title">{st("title")}</h2>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.core}>{st("coreLevel", { level: core?.level ?? payload?.coreLevel ?? 0 })}</span>
          <button className={styles.refreshButton} type="button" disabled={loading || refreshing} onClick={() => { void loadPassport(true); }} aria-label={st("refresh")} title={st("refresh")}>
            <RefreshCw size={15} className={refreshing ? styles.spin : undefined} />
          </button>
        </div>
      </header>

      {loading && !payload ? <p className={styles.muted}>{st("loading")}</p> : null}
      {error ? <p className={styles.error}><CircleAlert size={15} />{error}</p> : null}
      {message ? <p className={styles.success}><Check size={15} />{message}</p> : null}

      {payload?.skills.map((skill) => <SkillCard key={skill.id} skill={skill} st={st} />)}
    </section>
  );
}

function SkillCard({ skill, st }: { skill: PassportSkill; st: (key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => string }) {
  const currentCheck = skill.checks.find((check) => check.level > skill.earnedLevel) ?? skill.checks[skill.checks.length - 1] ?? null;
  const progress = currentCheck ? Math.min(100, Math.round((currentCheck.currentValue / currentCheck.threshold) * 100)) : 0;
  const currentLevelCompleted = currentCheck ? currentCheck.level <= skill.earnedLevel : false;
  const statusLabel = skill.status === "verified" ? st("verified") : st("unverified");

  return (
    <article className={styles.skillCard}>
      <div className={styles.skillCardHead}>
        <div className={styles.skillMark}><Activity size={19} /></div>
        <div className={styles.skillCopy}>
          <div className={styles.titleLine}>
            <strong>{skill.title}</strong>
            <span className={styles.levelPill}>L{skill.effectiveLevel}</span>
            <span className={`${styles.statusPill} ${skill.status === "verified" ? styles.status_verified : styles.status_unverified}`}>{statusLabel}</span>
          </div>
          <p>{skill.description}</p>
        </div>
        <div className={styles.levelBox}><strong>{skill.effectiveLevel}</strong><small>{st("effective")}</small></div>
      </div>

      <div className={styles.levelMetrics}>
        <span>{st("earned")}: <b>L{skill.earnedLevel}</b></span>
        <span>{st("effective")}: <b>L{skill.effectiveLevel}</b></span>
      </div>

      {currentCheck ? (
        <div className={styles.checkBox}>
          <div className={styles.checkHeader}><strong>{currentLevelCompleted ? st("completedLevel", { level: currentCheck.level }) : st("nextCheck")}</strong><span>L{currentCheck.level}</span></div>
          <p>{currentCheck.requirements}</p>
          {!currentLevelCompleted ? <div className={styles.progressTrack} aria-label={String(currentCheck.currentValue) + "/" + currentCheck.threshold}><span style={{ width: String(progress) + "%" }} /></div> : null}
          <div className={styles.checkMeta}><span>{st(logicMessageKey[currentCheck.verificationLogic])}</span><b>{currentLevelCompleted ? st("completed") : String(currentCheck.currentValue) + " / " + currentCheck.threshold}</b></div>
        </div>
      ) : <p className={styles.muted}>{st("noCheck")}</p>}
    </article>
  );
}

async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}