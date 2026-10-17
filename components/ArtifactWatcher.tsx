"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { ARTIFACTS, pickToAnnounce, type ArtifactKey } from "@/lib/artifacts";
import { ARTIFACTS_CHECK_EVENT, loadArtifacts, readSeenArtifacts, writeSeenArtifacts } from "@/lib/artifactsClient";
import type { MessageKey } from "@/lib/i18n";

const MIN_GAP_MS = 4000;

/**
 * Opens the "Artifact opened" window when a confirmed result unlocks a new achievement artifact. It reads what
 * the server says is unlocked (on start, when the app comes back to the front, after a challenge check, and when
 * a balance or the level changes) and announces only what this device has not announced yet. On a device with no
 * record yet, what is already unlocked is taken as known, so nobody gets a pile of old awards at once.
 */
export default function ArtifactWatcher() {
  const { user, core, wallet, t } = useUserContext();
  const userId = user?.id ?? null;
  const [queue, setQueue] = useState<ArtifactKey[]>([]);
  const [rewards, setRewards] = useState<Record<string, number>>({});
  const lastRun = useRef(0);
  const running = useRef(false);

  const check = useCallback(async (force = false) => {
    if (!userId || running.current) return;
    if (!force && Date.now() - lastRun.current < MIN_GAP_MS) return;
    running.current = true;
    lastRun.current = Date.now();
    try {
      const unlocked = await loadArtifacts();
      const previous = readSeenArtifacts(userId);
      const { announce, nextSeen } = pickToAnnounce(unlocked.map((item) => item.key), previous);
      // Announced artifacts are recorded when the window is closed; the quiet ones are recorded right away.
      writeSeenArtifacts(userId, nextSeen.filter((key) => !announce.includes(key as ArtifactKey)).concat(previous ?? []));
      setRewards((current) => ({ ...current, ...Object.fromEntries(unlocked.filter((item) => item.reward).map((item) => [item.key, Number(item.reward)])) }));
      if (announce.length) setQueue((current) => [...current, ...announce.filter((key) => !current.includes(key))]);
    } catch {
      // Missing an announcement is harmless: the artifact stays in the list and is announced at the next check.
    } finally {
      running.current = false;
    }
  }, [userId]);

  useEffect(() => {
    void check(true);
  }, [check]);

  useEffect(() => {
    void check();
  }, [check, core?.level, core?.balance, wallet?.balance]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onChecked = () => { window.setTimeout(() => void check(true), 600); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ARTIFACTS_CHECK_EVENT, onChecked);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ARTIFACTS_CHECK_EVENT, onChecked);
    };
  }, [check]);

  const key = queue[0];
  if (!userId || !key) return null;

  function close() {
    if (userId && key) writeSeenArtifacts(userId, [...(readSeenArtifacts(userId) ?? []), key]);
    setQueue((current) => current.slice(1));
  }

  return <ArtifactModal artifactKey={key} reward={rewards[key] ?? null} t={t} onClose={close} />;
}

/** The "Artifact opened" window: the picture, the name and what was confirmed. */
export function ArtifactModal({ artifactKey, reward, t, onClose }: { artifactKey: ArtifactKey; reward?: number | null; t: (key: MessageKey, values?: Record<string, string | number>) => string; onClose: () => void }) {
  const artifact = ARTIFACTS.find((item) => item.key === artifactKey);
  if (!artifact) return null;
  return (
    <Sheet bare dismissible={false} className="small artifact-modal" ariaLabel={t("artifact.opened")}>
      <span className="artifact-modal-kicker">{t("artifact.opened")}</span>
      <img className="artifact-modal-image" alt="" src={artifact.image} />
      <h2>{t(`artifact.${artifactKey}.title` as MessageKey)}</h2>
      <p>{t("artifact.proof", { proof: t(`artifact.${artifactKey}.proof` as MessageKey) })}</p>
      {reward ? <p className="artifact-modal-reward">{t("artifact.reward", { amount: reward })}</p> : null}
      <button className="challenge-primary-action" type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("oa:open-tab", { detail: artifact.target })); }}>{t(`artifact.${artifactKey}.cta` as MessageKey)}</button>
      <button className="secondary-button" type="button" onClick={onClose}>{t("app.common.excellent")}</button>
    </Sheet>
  );
}
