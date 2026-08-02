"use client";

import { Check, CircleAlert, Code2, GitBranch, Send, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/lib/i18n";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import {
  SOFTWARE_CREATION_SLUG,
  type PassportSkill,
  type SkillEvidence,
  type SkillPassportPayload,
  type SkillReviewRequest,
  type SkillSubmission
} from "@/lib/skills";
import { skillTranslate } from "@/lib/skillsI18n";
import styles from "@/components/SkillPassportApp.module.css";
import { useUserContext } from "@/components/UserProvider";

type EvidenceForm = {
  deliverableTitle: string;
  deliverableDescription: string;
  acceptanceCriteria: string;
  repoUrl: string;
  proofUrl: string;
  testScenario: string;
  limitations: string;
};

type ReviewDraft = {
  verdict: "pass" | "rework";
  reproducibility: boolean;
  criteriaMet: boolean;
  proofSufficient: boolean;
  safety: boolean;
  criticalIssue: boolean;
  recommendation: string;
  comment: string;
};

const EMPTY_FORM: EvidenceForm = {
  deliverableTitle: "",
  deliverableDescription: "",
  acceptanceCriteria: "",
  repoUrl: "",
  proofUrl: "",
  testScenario: "",
  limitations: ""
};

export default function SkillPassportApp() {
  const { user, core, locale } = useUserContext();
  const [payload, setPayload] = useState<SkillPassportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [form, setForm] = useState<EvidenceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});

  const st = useCallback((key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => skillTranslate(locale, key, values), [locale]);
  const loadPassport = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/skills?locale=${locale}&ts=${Date.now()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
      });
      const nextPayload = (await response.json()) as SkillPassportPayload;
      if (!response.ok || nextPayload.error) throw new Error(nextPayload.error ?? st("error"));
      setPayload(nextPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : st("error"));
    } finally {
      setLoading(false);
    }
  }, [locale, st, user]);

  useEffect(() => {
    void loadPassport();
  }, [loadPassport]);

  const softwareSkill = useMemo(
    () => payload?.skills.find((skill) => skill.slug === SOFTWARE_CREATION_SLUG) ?? null,
    [payload]
  );
  const submission = softwareSkill?.submission ?? null;

  useEffect(() => {
    const evidence = submission?.evidence;
    if (!evidence) return;
    setForm(evidenceToForm(evidence));
  }, [submission?.evidence]);

  useEffect(() => {
    if (!payload) return;
    setReviewDrafts((current) => {
      const next = { ...current };
      payload.reviewQueue.forEach((request) => {
        if (!next[request.id]) next[request.id] = createReviewDraft();
      });
      return next;
    });
  }, [payload]);

  async function saveEvidence(submit: boolean) {
    if (!user) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/skills/submissions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ skillSlug: SOFTWARE_CREATION_SLUG, ...form, submit })
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? st("error"));
      setMessage(st(submit ? "sendToReview" : "saved"));
      await loadPassport();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : st("error"));
    } finally {
      setSaving(false);
    }
  }

  async function reviewAction(requestId: string, action: "claim" | "decide", override: Partial<ReviewDraft> = {}) {
    const draft = { ...(reviewDrafts[requestId] ?? createReviewDraft()), ...override };
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/skills/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(action === "claim" ? { action, requestId } : { action, requestId, ...draft })
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? st("error"));
      await loadPassport();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : st("error"));
    }
  }

  if (!user) return null;

  return (
    <section className={styles.passport} aria-labelledby="skill-passport-title">
      <header className={styles.header}>
        <div className={styles.icon}><Sparkles size={18} /></div>
        <div>
          <span className={styles.kicker}>{st("kicker")}</span>
          <h2 id="skill-passport-title">{st("title")}</h2>
          <p>{st("description")}</p>
        </div>
        <span className={styles.core}>{st("coreLevel", { level: core?.level ?? payload?.coreLevel ?? 0 })}</span>
      </header>

      {loading && !payload ? <p className={styles.muted}>{st("loading")}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      {softwareSkill ? (
        <SkillCard
          locale={locale}
          skill={softwareSkill}
          submission={submission}
          st={st}
          onOpen={() => setChallengeOpen((current) => !current)}
        />
      ) : null}

      {challengeOpen && softwareSkill ? (
        <ChallengePanel
          form={form}
          locale={locale}
          saving={saving}
          skill={softwareSkill}
          submission={submission}
          st={st}
          onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))}
          onSave={() => { void saveEvidence(false); }}
          onSubmit={() => { void saveEvidence(true); }}
        />
      ) : null}

      {submission ? <SubmissionReviews requests={submission.reviewRequests} st={st} /> : null}
      {payload ? (
        <ReviewQueue
          drafts={reviewDrafts}
          locale={locale}
          requests={payload.reviewQueue}
          st={st}
          onDraftChange={(requestId, key, value) => setReviewDrafts((current) => ({ ...current, [requestId]: { ...(current[requestId] ?? createReviewDraft()), [key]: value } }))}
          onAction={(requestId, action, override) => { void reviewAction(requestId, action, override); }}
        />
      ) : null}
    </section>
  );
}

function SkillCard({ skill, submission, st, onOpen }: { locale: AppLocale; skill: PassportSkill; submission: SkillSubmission | null; st: (key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => string; onOpen: () => void }) {
  const status = submission?.status ?? (skill.status === "verified" ? "accepted" : "draft");
  const statusLabel = status === "in_review" ? st("inReview") : status === "rework" ? st("rework") : status === "accepted" ? st("accepted") : st("draft");
  return (
    <article className={styles.skillCard}>
      <div className={styles.skillCardHead}>
        <div className={styles.skillMark}><Code2 size={20} /></div>
        <div className={styles.skillCopy}>
          <div className={styles.titleLine}><strong>{skill.title || st("softwareTitle")}</strong><span className={styles.levelPill}>L1</span><span className={`${styles.statusPill} ${styles[`status_${status}`]}`}>{statusLabel}</span></div>
          <p>{skill.description || st("softwareDescription")}</p>
        </div>
        <div className={styles.levelBox}><strong>{skill.effectiveLevel}</strong><small>{st("effective")}</small></div>
      </div>
      <div className={styles.levelMetrics}><span>{st("earned")}: <b>{skill.earnedLevel}</b></span><span>{st("effective")}: <b>{skill.effectiveLevel}</b></span></div>
      {skill.status !== "verified" ? <button className={styles.primaryButton} type="button" onClick={onOpen}><Sparkles size={16} />{st("open")}</button> : <p className={styles.verified}><Check size={16} />{st("verified")}</p>}
    </article>
  );
}

function ChallengePanel({ form, skill, submission, st, saving, onChange, onSave, onSubmit }: { form: EvidenceForm; locale: AppLocale; skill: PassportSkill; submission: SkillSubmission | null; st: (key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => string; saving: boolean; onChange: (key: keyof EvidenceForm, value: string) => void; onSave: () => void; onSubmit: () => void }) {
  return (
    <section className={styles.challenge} aria-labelledby="software-creation-title">
      <div className={styles.challengeHeader}><div><span className={styles.kicker}>{st("softwareLevel")}</span><h3 id="software-creation-title">{st("softwareTitle")}</h3><p>{st("softwareDescription")}</p></div><GitBranch size={26} /></div>
      <div className={styles.briefGrid}>
        <div className={styles.brief}><strong>{st("learning")}</strong><ol>{skill.learningPath.map((item) => <li key={item}>{item}</li>)}</ol></div>
        <div className={styles.brief}><strong>{st("brief")}</strong><p>{st("briefDescription")}</p><p>{skill.rule?.requirements ?? st("requirements")}</p></div>
      </div>
      {skill.rule?.rubric.length ? <div className={styles.rubric}><strong>{st("rubric")}</strong><div>{skill.rule.rubric.map((item) => <span key={item.key}><ShieldCheck size={14} />{item.label}</span>)}</div></div> : null}
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <Field label={st("fieldTitle")} value={form.deliverableTitle} placeholder={st("titlePlaceholder")} onChange={(value) => onChange("deliverableTitle", value)} />
        <Field label={st("fieldDescription")} value={form.deliverableDescription} placeholder={st("descriptionPlaceholder")} multiline onChange={(value) => onChange("deliverableDescription", value)} />
        <Field label={st("fieldCriteria")} value={form.acceptanceCriteria} placeholder={st("criteriaPlaceholder")} multiline onChange={(value) => onChange("acceptanceCriteria", value)} />
        <div className={styles.twoColumns}>
          <Field label={st("fieldRepo")} value={form.repoUrl} placeholder="https://github.com/..." type="url" onChange={(value) => onChange("repoUrl", value)} />
          <Field label={st("fieldProof")} value={form.proofUrl} placeholder="https://..." type="url" onChange={(value) => onChange("proofUrl", value)} />
        </div>
        <Field label={st("fieldTest")} value={form.testScenario} placeholder={st("testPlaceholder")} multiline onChange={(value) => onChange("testScenario", value)} />
        <Field label={st("fieldLimitations")} value={form.limitations} placeholder={st("limitationsPlaceholder")} multiline onChange={(value) => onChange("limitations", value)} />
        <div className={styles.formActions}><button className={styles.secondaryButton} type="button" disabled={saving} onClick={onSave}>{st("saveDraft")}</button><button className={styles.primaryButton} type="submit" disabled={saving}><Send size={16} />{submission ? st("updateEvidence") : st("sendToReview")}</button></div>
      </form>
    </section>
  );
}

function SubmissionReviews({ requests, st }: { requests: SkillReviewRequest[]; st: (key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => string }) {
  if (!requests.length) return null;
  return <section className={styles.reviews}><div className={styles.sectionTitle}><UsersRound size={17} /><strong>{st("reviewTitle")}</strong><span>{requests.filter((request) => request.decision?.verdict === "pass").length}/3</span></div><p className={styles.muted}>{st("reviewSubtitle")}</p><div className={styles.slotList}>{requests.map((request) => <div className={styles.slot} key={request.id}><span>{request.slotNo}</span><strong>{request.decision ? request.decision.verdict === "pass" ? st("pass") : st("requestRework") : request.status === "assigned" ? st("reviewAssigned") : request.status === "decided" ? st("reviewDecided") : st("reviewOpen")}</strong>{request.decision?.criticalIssue ? <CircleAlert size={15} className={styles.errorIcon} /> : request.decision ? <Check size={15} className={styles.successIcon} /> : null}</div>)}</div></section>;
}

function ReviewQueue({ requests, drafts, st, onDraftChange, onAction }: { requests: SkillReviewRequest[]; drafts: Record<string, ReviewDraft>; locale: AppLocale; st: (key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => string; onDraftChange: (requestId: string, key: keyof ReviewDraft, value: string | boolean) => void; onAction: (requestId: string, action: "claim" | "decide", override?: Partial<ReviewDraft>) => void }) {
  return (
    <section className={styles.reviews}>
      <div className={styles.sectionTitle}><UsersRound size={17} /><strong>{st("queue")}</strong><span>{requests.length}</span></div>
      {!requests.length ? <p className={styles.muted}>{st("emptyQueue")}</p> : null}
      {requests.map((request) => {
        const draft = drafts[request.id] ?? createReviewDraft();
        return <article className={styles.queueCard} key={request.id}><div className={styles.queueHead}><div><strong>{request.skillTitle}</strong><small>{request.ownerName} · L{request.targetLevel}</small></div><span className={styles.statusPill}>{request.status === "assigned" ? st("reviewAssigned") : request.status === "decided" ? st("reviewDecided") : st("reviewOpen")}</span></div>{request.evidence ? <a className={styles.proofLink} href={request.evidence.proofUrl} target="_blank" rel="noreferrer"><Code2 size={14} />{request.evidence.deliverableTitle}</a> : null}{request.status === "open" && request.canClaim ? <button className={styles.secondaryButton} type="button" onClick={() => onAction(request.id, "claim")}>{st("claim")}</button> : null}{request.status === "assigned" ? <ReviewForm draft={draft} st={st} onChange={(key, value) => onDraftChange(request.id, key, value)} onSubmit={(verdict) => onAction(request.id, "decide", { verdict })} /> : null}{request.decision ? <p className={styles.reviewOutcome}>{request.decision.verdict === "pass" ? st("pass") : st("requestRework")} · {request.decision.comment}</p> : null}</article>;
      })}
    </section>
  );
}

function ReviewForm({ draft, st, onChange, onSubmit }: { draft: ReviewDraft; st: (key: Parameters<typeof skillTranslate>[1], values?: Record<string, string | number>) => string; onChange: (key: keyof ReviewDraft, value: string | boolean) => void; onSubmit: (verdict: "pass" | "rework") => void }) {
  return <div className={styles.reviewForm}><div className={styles.checkGrid}>{(["reproducibility", "criteriaMet", "proofSufficient", "safety"] as const).map((key) => <label key={key}><input type="checkbox" checked={draft[key]} onChange={(event) => onChange(key, event.target.checked)} />{st(key === "criteriaMet" ? "criteria" : key === "proofSufficient" ? "proof" : key)}</label>)}</div><label className={styles.checkbox}><input type="checkbox" checked={draft.criticalIssue} onChange={(event) => onChange("criticalIssue", event.target.checked)} />{st("critical")}</label><textarea value={draft.comment} placeholder={st("commentPlaceholder")} onChange={(event) => onChange("comment", event.target.value)} /><textarea value={draft.recommendation} placeholder={st("recommendationPlaceholder")} onChange={(event) => onChange("recommendation", event.target.value)} /><div className={styles.formActions}><button className={styles.secondaryButton} type="button" onClick={() => { onSubmit("rework"); }}>{st("requestRework")}</button><button className={styles.primaryButton} type="button" onClick={() => { onSubmit("pass"); }}>{st("pass")}</button></div></div>;
}

function Field({ label, value, placeholder, type = "text", multiline = false, onChange }: { label: string; value: string; placeholder: string; type?: "text" | "url"; multiline?: boolean; onChange: (value: string) => void }) {
  return <label className={styles.field}><span>{label}</span>{multiline ? <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} required /> : <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} required />}</label>;
}

function evidenceToForm(evidence: SkillEvidence): EvidenceForm {
  return { deliverableTitle: evidence.deliverableTitle, deliverableDescription: evidence.deliverableDescription, acceptanceCriteria: evidence.acceptanceCriteria, repoUrl: evidence.repoUrl, proofUrl: evidence.proofUrl, testScenario: evidence.testScenario, limitations: evidence.limitations };
}

function createReviewDraft(): ReviewDraft {
  return { verdict: "pass", reproducibility: false, criteriaMet: false, proofSufficient: false, safety: false, criticalIssue: false, recommendation: "", comment: "" };
}

async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

