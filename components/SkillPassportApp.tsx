"use client";

import { Activity, Check, CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { PassportSkill, SkillPassportPayload } from "@/lib/skills";
import { skillTranslate } from "@/lib/skillsI18n";
import styles from "@/components/SkillPassportApp.module.css";
import { useUserContext } from "@/components/UserProvider";



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

      {payload?.skills.map((skill) => <SkillCard key={skill.id} skill={skill} />)}
    </section>
  );
}

function SkillCard({ skill }: { skill: PassportSkill }) {
  const nextCheck = skill.checks.find((check) => check.level > skill.earnedLevel) ?? skill.checks.at(-1) ?? null;
  const progress = nextCheck ? Math.min(100, Math.round((nextCheck.currentValue / nextCheck.threshold) * 100)) : 0;

  return (
    <article className={styles.skillCard}>
      <div className={styles.skillCardHead}>
        <div className={styles.skillMark}><Activity size={19} /></div>
        <div className={styles.skillCopy}>
          <div className={styles.titleLine}>
            <strong>{skill.title}</strong>
            <span className={styles.levelPill}>🔼{skill.effectiveLevel}</span>
          </div>
          <p>{skill.description}</p>
        </div>
      </div>

      {nextCheck ? (
        <div className={styles.progressRow} aria-label={String(nextCheck.currentValue) + "/" + nextCheck.threshold}>
          <div className={styles.progressMeta}>
            <strong>{nextCheck.currentValue}/{nextCheck.threshold}</strong>
            <span>{nextCheck.requirements}</span>
          </div>
          <div className={styles.progressTrack}><span style={{ width: String(progress) + "%" }} /></div>
        </div>
      ) : null}
    </article>
  );
}

async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}