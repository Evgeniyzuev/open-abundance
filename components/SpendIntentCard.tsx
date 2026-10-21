"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { SPEND_CATEGORIES } from "@/lib/spendCategories";

type Intents = { categories: string[]; offersConsent: boolean };

/**
 * "What would you like to move into Open Abundance": categories of regular spending (no amounts) and the consent
 * to receive favourable offers for them. Collapsed by default; nothing is saved until the person presses save.
 */
export default function SpendIntentCard() {
  const { t, user } = useUserContext();
  const [intents, setIntents] = useState<Intents>({ categories: [], offersConsent: false });
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchWithSupabaseAuth("/api/spend-intents", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? (response.json() as Promise<Intents>) : null))
      .then((data) => { if (!cancelled && data) setIntents({ categories: data.categories, offersConsent: data.offersConsent }); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!user || !loaded) return null;

  function toggle(category: string) {
    setState("idle");
    setIntents((current) => ({
      ...current,
      categories: current.categories.includes(category) ? current.categories.filter((item) => item !== category) : [...current.categories, category]
    }));
  }

  async function save() {
    setState("saving");
    try {
      const response = await fetchWithSupabaseAuth(
        "/api/spend-intents",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intents) },
        { authRequired: true }
      );
      setState(response.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <details className="help-profile home-card">
      <summary>{t("spend.title")}</summary>
      <p>{t("spend.description")}</p>
      <div className="chips">
        {SPEND_CATEGORIES.map((category) => (
          <button aria-pressed={intents.categories.includes(category)} className="chip" key={category} type="button" onClick={() => toggle(category)}>
            {t(`spend.cat.${category}` as MessageKey)}
          </button>
        ))}
      </div>
      <label className="help-profile-consent">
        <input
          checked={intents.offersConsent}
          type="checkbox"
          onChange={(event) => { setState("idle"); setIntents((current) => ({ ...current, offersConsent: event.target.checked })); }}
        />
        <span>{t("spend.consent")}</span>
      </label>
      <button className="secondary-button" disabled={state === "saving"} type="button" onClick={() => void save()}>
        {t("spend.save")}
      </button>
      {state === "saved" ? <small role="status">{t("spend.saved")}</small> : null}
      {state === "error" ? <small className="finance-error" role="alert">{t("spend.error")}</small> : null}
    </details>
  );
}
