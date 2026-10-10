"use client";

import { Download, House, MoreVertical, Share2, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { InstallIllustration, type InstallIllustrationKind } from "@/components/InstallGuideIllustrations";
import type { MessageKey } from "@/lib/i18n";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type Platform = "ios" | "android";

/** Screenshots shown with the matching step. A step without a file simply shows no image. */
const STEP_SCREENSHOTS: Partial<Record<Platform, Partial<Record<string, string>>>> = {
  ios: { home: "/install-guide/ios-add-to-home.jpg" }
};

const DETAIL_STEPS: Record<Platform, MessageKey[]> = {
  ios: ["installGuide.detail.ios.1", "installGuide.detail.ios.2", "installGuide.detail.ios.3", "installGuide.detail.ios.4"],
  android: ["installGuide.detail.android.1", "installGuide.detail.android.2", "installGuide.detail.android.3", "installGuide.detail.android.4"]
};

/** Schematic drawing shown under a numbered step (index from 0). Steps without one show text only. */
const STEP_ILLUSTRATIONS: Record<Platform, Array<InstallIllustrationKind | null>> = {
  ios: [null, "ios-share", null, "home-icon"],
  android: [null, "android-menu", "android-install", "home-icon"]
};

const OFFICIAL_GUIDE: Record<Platform, { url: (locale: string) => string; label: MessageKey }> = {
  ios: {
    url: (locale) => locale === "ru"
      ? "https://support.apple.com/ru-ru/guide/iphone/iphea86e5236/ios"
      : "https://support.apple.com/guide/iphone/iphea86e5236/ios",
    label: "installGuide.official.ios"
  },
  android: {
    url: (locale) => `https://support.google.com/chrome/answer/9658361?hl=${locale === "ru" ? "ru" : "en"}`,
    label: "installGuide.official.android"
  }
};

export function detectInstallPlatform(): Platform {
  if (typeof navigator === "undefined") return "android";
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "android";
}

/** Three-step visual guide with platform tabs, an optional install button and a desktop QR code. */
export function InstallGuide({
  installPromptAvailable,
  isDesktop,
  platform,
  t,
  onInstall,
  onPlatformChange
}: {
  installPromptAvailable: boolean;
  isDesktop: boolean;
  platform: string;
  t: TFunction;
  onInstall: () => void;
  onPlatformChange: (platform: Platform) => void;
}) {
  const shownPlatform: Platform = platform === "ios" ? "ios" : "android";
  const steps = shownPlatform === "ios"
    ? [{ icon: Share2, key: "share" }, { icon: Smartphone, key: "home" }, { icon: House, key: "open" }]
    : [{ icon: MoreVertical, key: "menu" }, { icon: Download, key: "install" }, { icon: House, key: "open" }];
  return (
    <div className="app-testing-install-guide">
      <div className="app-testing-platform-tabs">
        <button className={shownPlatform === "ios" ? "active" : ""} type="button" onClick={() => onPlatformChange("ios")}>iOS</button>
        <button className={shownPlatform === "android" ? "active" : ""} type="button" onClick={() => onPlatformChange("android")}>Android</button>
      </div>
      <div className="install-visual-grid" role="img" aria-label={t(`appTesting.installGuide.${shownPlatform}` as MessageKey)}>
        {steps.map(({ icon: Icon, key }, index) => (
          <div className="install-visual-step" key={key}>
            <span>{index + 1}</span>
            <Icon size={26} />
            <small>{t(`appTesting.installStep.${shownPlatform}.${key}` as MessageKey)}</small>
          </div>
        ))}
      </div>
      {shownPlatform === "android" && installPromptAvailable ? (
        <button className="app-testing-open-area" type="button" onClick={onInstall}>{t("appTesting.installNow")}</button>
      ) : null}
      {isDesktop ? (
        <div className="app-testing-qr">
          <QRCodeSVG value={typeof window === "undefined" ? "/" : window.location.origin} size={132} level="M" marginSize={1} />
          <p>{t("appTesting.desktopQr")}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Collapsed detailed instructions for the install challenge: the shared visual guide, numbered
 * steps in plain language and screenshots where available. Collapsed by default so the challenge
 * stays short.
 */
export function InstallGuideDetails({
  installPromptAvailable,
  isDesktop,
  locale,
  t,
  onInstall
}: {
  installPromptAvailable: boolean;
  isDesktop: boolean;
  locale: string;
  t: TFunction;
  onInstall: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>(detectInstallPlatform);
  const screenshot = platform === "ios" ? STEP_SCREENSHOTS.ios?.home : undefined;

  return (
    <details className="install-guide-details">
      <summary>{t("installGuide.summary")}</summary>
      <InstallGuide
        installPromptAvailable={installPromptAvailable}
        isDesktop={isDesktop}
        platform={platform}
        t={t}
        onInstall={onInstall}
        onPlatformChange={setPlatform}
      />
      <ol className="install-guide-steps">
        {DETAIL_STEPS[platform].map((key, index) => {
          const illustration = STEP_ILLUSTRATIONS[platform][index];
          return (
            <li key={key}>
              {t(key)}
              {illustration ? <InstallIllustration kind={illustration} label={t(key)} /> : null}
            </li>
          );
        })}
      </ol>
      {screenshot ? (
        <figure className="install-guide-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={t("installGuide.shotAlt.ios")} loading="lazy" src={screenshot} />
          <figcaption>{t("installGuide.shotCaption.ios")}</figcaption>
        </figure>
      ) : null}
      <p className="challenge-note">{t(platform === "ios" ? "installGuide.note.ios" : "installGuide.note.android")}</p>
      <a className="install-guide-official" href={OFFICIAL_GUIDE[platform].url(locale)} rel="noopener noreferrer" target="_blank">
        {t(OFFICIAL_GUIDE[platform].label)}
      </a>
    </details>
  );
}
