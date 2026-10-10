"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { NEED_TAGS, OFFER_TAGS } from "@/lib/helpTags";
import { NICHES } from "@/lib/nicheTasks";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type Profile = { offers: string[]; needs: string[]; matchConsent: boolean };

/**
 * Optional "can help / need help" tags with explicit consent to use them for matching.
 * Collapsed by default so the wishes screen stays quiet; nothing is saved until the person
 * presses save, and tags are never shown to other people.
 */
export default function HelpProfileCard() {
  const { t, locale, user } = useUserContext();
  const [profile, setProfile] = useState<Profile>({ offers: [], needs: [], matchConsent: false });
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // The user object is replaced on every context refresh; key the load on the stable id.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchWithSupabaseAuth("/api/help-profile", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? (response.json() as Promise<Profile>) : null))
      .then((data) => {
        if (!cancelled && data) setProfile(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!user || !loaded) return null;

  function toggle(field: "offers" | "needs", tag: string) {
    setState("idle");
    setProfile((current) => ({
      ...current,
      [field]: current[field].includes(tag) ? current[field].filter((item) => item !== tag) : [...current[field], tag]
    }));
  }

  async function save() {
    setState("saving");
    try {
      const response = await fetchWithSupabaseAuth(
        "/api/help-profile",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) },
        { authRequired: true }
      );
      setState(response.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  const nicheTitle = (key: string) => NICHES.find((niche) => niche.key === key)?.title[locale === "ru" ? "ru" : "en"] ?? key;

  return (
    <details className="help-profile home-card">
      <summary>{t("help.title")}</summary>
      <p>{t("help.description")}</p>

      <h3>{t("help.offers")}</h3>
      <div className="chips">
        {OFFER_TAGS.map((tag) => (
          <button aria-pressed={profile.offers.includes(tag)} className="chip" key={tag} type="button" onClick={() => toggle("offers", tag)}>
            {nicheTitle(tag)}
          </button>
        ))}
      </div>

      <h3>{t("help.needs")}</h3>
      <div className="chips">
        {NEED_TAGS.map((tag) => (
          <button aria-pressed={profile.needs.includes(tag)} className="chip" key={tag} type="button" onClick={() => toggle("needs", tag)}>
            {t(`help.need.${tag}` as MessageKey)}
          </button>
        ))}
      </div>

      <label className="help-profile-consent">
        <input
          checked={profile.matchConsent}
          type="checkbox"
          onChange={(event) => {
            setState("idle");
            setProfile((current) => ({ ...current, matchConsent: event.target.checked }));
          }}
        />
        <span>{t("help.consent")}</span>
      </label>

      <button className="secondary-button" disabled={state === "saving"} type="button" onClick={() => void save()}>
        {t("help.save")}
      </button>
      {state === "saved" ? <small role="status">{t("help.saved")}</small> : null}
      {state === "error" ? <small className="finance-error" role="alert">{t("help.error")}</small> : null}
    </details>
  );
}
