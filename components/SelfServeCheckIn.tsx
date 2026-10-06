"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { trackClientEvent } from "@/lib/clientAnalytics";
import type { MessageKey } from "@/lib/i18n";

const CHECK_IN_WINDOW_HOURS = 24 * 7;
const CHECK_IN_START_HOURS = 24;
const ANSWERS = [
  ["useful_step", "experiment.checkin.answerStep"],
  ["useful_option", "experiment.checkin.answerOption"],
  ["not_yet", "experiment.checkin.answerNotYet"],
  ["not_a_fit", "experiment.checkin.answerNotFit"]
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>;

export default function SelfServeCheckIn({ active }: { active: boolean }) {
  const { t, user } = useUserContext();
  const [visibleForUserId, setVisibleForUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !user) {
      setVisibleForUserId(null);
      return;
    }

    const createdAt = Date.parse(user.created_at);
    const elapsedHours = (Date.now() - createdAt) / (60 * 60 * 1000);
    if (!Number.isFinite(createdAt) || elapsedHours < CHECK_IN_START_HOURS || elapsedHours > CHECK_IN_WINDOW_HOURS) {
      setVisibleForUserId(null);
      return;
    }

    try {
      if (window.localStorage.getItem(checkInStorageKey(user.id))) {
        setVisibleForUserId(null);
        return;
      }
    } catch {
      // Keep the optional prompt available when local storage is disabled.
    }

    setVisibleForUserId(user.id);
  }, [active, user]);

  if (!active || !user || visibleForUserId !== user.id) return null;

  function recordAnswer(answer: string) {
    void trackClientEvent("self_serve_checkin_answered", { answer });
    dismiss();
  }

  function dismiss() {
    try {
      if (user) window.localStorage.setItem(checkInStorageKey(user.id), "done");
    } catch {
      // The prompt remains dismissible for this render even without local storage.
    }
    setVisibleForUserId(null);
  }

  function skip() {
    void trackClientEvent("self_serve_checkin_skipped");
    dismiss();
  }

  return (
    <section className="home-card self-serve-checkin" aria-labelledby="self-serve-checkin-title">
      <div>
        <span className="home-card-label">Open Abundance</span>
        <h2 id="self-serve-checkin-title">{t("experiment.checkin.title")}</h2>
        <p>{t("experiment.checkin.description")}</p>
      </div>
      <div className="self-serve-checkin-actions">
        {ANSWERS.map(([answer, key]) => (
          <button className="secondary-button" key={answer} type="button" onClick={() => recordAnswer(answer)}>
            {t(key)}
          </button>
        ))}
      </div>
      <button className="text-button self-serve-checkin-skip" type="button" onClick={skip}>
        {t("experiment.checkin.skip")}
      </button>
    </section>
  );
}

function checkInStorageKey(userId: string): string {
  return `openAbundanceSelfServeCheckIn.v1.${userId}`;
}
