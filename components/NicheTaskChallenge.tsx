"use client";

import { useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { NICHES } from "@/lib/nicheTasks";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type NicheTaskChallengeProps = {
  locale: AppLocale;
  t: TFunction;
  onProof: (taskKey: string) => Promise<void>;
  onPassedChange?: (passed: boolean) => void;
};

export default function NicheTaskChallenge({ locale, t, onProof, onPassedChange }: NicheTaskChallengeProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!selectedKey) return;
    setSaving(true);
    setError(null);
    try {
      await onProof(selectedKey);
      setSaved(true);
      onPassedChange?.(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("challenges.niche.saveFailed"));
      onPassedChange?.(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="attention-challenge">
      <div className="attention-challenge-heading">
        <span>{t("challenges.niche.eyebrow")}</span>
        <strong>{t("challenges.niche.title")}</strong>
      </div>

      {NICHES.map((niche) => (
        <fieldset className="challenge-field" key={niche.key} disabled={saved}>
          <legend>{niche.title[locale]}</legend>
          {niche.tasks.map((task) => (
            <label className="challenge-field" key={task.key} htmlFor={`niche-${task.key}`}>
              <span>
                <input
                  checked={selectedKey === task.key}
                  id={`niche-${task.key}`}
                  name="niche-task"
                  type="radio"
                  onChange={() => {
                    setSelectedKey(task.key);
                    onPassedChange?.(false);
                  }}
                />{" "}
                <strong>{task.title[locale]}</strong>
              </span>
              {selectedKey === task.key ? <p className="challenge-note">{task.firstStep[locale]}</p> : null}
            </label>
          ))}
        </fieldset>
      ))}

      <p className="challenge-note">{t("challenges.niche.hint")}</p>
      {error ? <p className="challenge-error">{error}</p> : null}
      <button className="challenge-primary-action" disabled={!selectedKey || saving || saved} type="button" onClick={() => void save()}>
        {saved ? t("challenges.niche.saved") : saving ? t("app.common.loading") : t("challenges.niche.save")}
      </button>
    </section>
  );
}
