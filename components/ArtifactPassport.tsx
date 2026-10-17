"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { ARTIFACTS, type UnlockedArtifact } from "@/lib/artifacts";
import { ARTIFACTS_CHECK_EVENT, loadArtifacts } from "@/lib/artifactsClient";
import type { AppLocale, MessageKey } from "@/lib/i18n";

/**
 * "Artifacts" of the Results screen, apart from the items: confirmed achievements that cannot be bought or
 * sold. Loads what the server says is opened and shows it with ArtifactGrid.
 */
export default function ArtifactPassport() {
  const { locale, t, user } = useUserContext();
  const [unlocked, setUnlocked] = useState<UnlockedArtifact[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      loadArtifacts().then((rows) => { if (!cancelled) setUnlocked(rows); }).catch(() => undefined);
    };
    load();
    window.addEventListener(ARTIFACTS_CHECK_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ARTIFACTS_CHECK_EVENT, load);
    };
  }, [user]);

  if (!user) return null;
  return <ArtifactGrid unlocked={unlocked ?? []} locale={locale} t={t} />;
}

/** An opened artifact shows its picture, name, what was confirmed and the date; a closed one is a faded silhouette with a hint. Collapsed by default, the count is in the heading. */
export function ArtifactGrid({ unlocked, locale, t }: { unlocked: UnlockedArtifact[]; locale: AppLocale; t: (key: MessageKey, values?: Record<string, string | number>) => string }) {
  const opened = new Map(unlocked.map((item) => [item.key, item]));
  return (
    <details className="artifact-passport">
      <summary>
        <strong>{t("artifact.passport")}</strong>
        <small>{t("artifact.count", { count: opened.size, total: ARTIFACTS.length })}</small>
      </summary>
      <ul className="artifact-grid">
        {ARTIFACTS.map((artifact) => {
          const item = opened.get(artifact.key);
          const date = item?.at ? new Date(item.at).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "";
          return (
            <li className={`artifact-tile${item ? "" : " locked"}`} key={artifact.key}>
              <span className="artifact-tile-image">
                <img alt="" loading="lazy" src={artifact.image} />
                {item ? null : <i aria-hidden="true">?</i>}
              </span>
              <strong>{t(`artifact.${artifact.key}.title` as MessageKey)}</strong>
              <small>{item ? `${t(`artifact.${artifact.key}.proof` as MessageKey)}${date ? ` · ${date}` : ""}` : t("artifact.locked", { hint: t(`artifact.${artifact.key}.hint` as MessageKey) })}</small>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
