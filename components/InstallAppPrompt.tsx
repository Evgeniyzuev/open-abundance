"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { InstallGuide, detectInstallPlatform } from "@/components/InstallGuide";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { isStandaloneDisplay } from "@/lib/installPing";
import { bumpPromptCount, getPromptCount, markPromptShownToday, promptShownToday } from "@/lib/promptSchedule";
import { canPromptPwaInstall, promptPwaInstall, subscribeToPwaInstallPrompt } from "@/lib/pwaInstall";

const FIRST_CHECK_DELAY_MS = 3_000;
const POLL_MS = 2_000;
const MAX_POLLS = 45; // about 90 s of waiting for other dialogs (the level-up celebration) to close
const MAX_SHOWS = 5;

function isPhoneBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const iPadOs = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || iPadOs;
}

/**
 * On a phone, in a browser tab (not the installed app), suggests adding the app to the Home Screen right after the
 * person reaches their first level (it waits for the level-up celebration to close): at most once a day (shared with
 * the reminders pop-up) and at most five times. Android uses the browser's own install dialog when it is offered;
 * iPhone gets the three-step guide because it has no install dialog.
 */
export default function InstallAppPrompt() {
  const { core, t, user } = useUserContext();
  const [open, setOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android">("android");
  const userId = user?.id ?? null;
  const level = core?.level ?? 0;

  useEffect(() => {
    const update = () => setCanInstall(canPromptPwaInstall());
    update();
    return subscribeToPwaInstallPrompt(update);
  }, []);

  useEffect(() => {
    if (!userId || level < 1 || !isPhoneBrowser() || isStandaloneDisplay()) return;
    let cancelled = false;
    let timer: number | undefined;
    let polls = 0;

    const check = () => {
      if (cancelled || isStandaloneDisplay()) return;
      if (promptShownToday(userId) || getPromptCount("install", userId) >= MAX_SHOWS) return;
      if (document.querySelector('[role="dialog"]')) {
        polls += 1;
        if (polls < MAX_POLLS) timer = window.setTimeout(check, POLL_MS); // otherwise: next visit
        return;
      }
      markPromptShownToday(userId);
      bumpPromptCount("install", userId);
      setPlatform(detectInstallPlatform());
      setOpen(true);
    };

    timer = window.setTimeout(check, FIRST_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId, level]);

  async function install() {
    const result = await promptPwaInstall();
    if (result !== "unavailable") setOpen(false);
  }

  if (!open) return null;

  const androidInstallDialog = platform === "android" && canInstall;

  return (
    <Sheet bare className="small challenge-complete-modal" titleId="install-app-title" onClose={() => setOpen(false)}>
      <span className="streak-complete-icon"><Smartphone size={30} aria-hidden="true" /></span>
      <h2 id="install-app-title">{t("install.prompt.title")}</h2>
      <p>{t("install.prompt.body")}</p>
      {androidInstallDialog ? null : (
        <InstallGuide installPromptAvailable={false} isDesktop={false} platform={platform} t={t} onInstall={() => undefined} onPlatformChange={setPlatform} />
      )}
      <div className="push-prompt-actions">
        <button className="push-prompt-later" type="button" onClick={() => setOpen(false)}>{t("push.prompt.later")}</button>
        {androidInstallDialog ? (
          <button className="challenge-primary-action" type="button" onClick={() => void install()}>{t("install.prompt.install")}</button>
        ) : (
          <button className="challenge-primary-action" type="button" onClick={() => setOpen(false)}>{t("install.prompt.gotIt")}</button>
        )}
      </div>
    </Sheet>
  );
}
