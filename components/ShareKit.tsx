"use client";

import { useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { shareTargets } from "@/lib/shareTargets";

/**
 * Free sharing without a publishing service: each network opens its own composer with the link,
 * the system share sheet sends the image to Instagram, TikTok and other apps on the phone.
 */
export default function ShareKit({ url, text, imageUrl, storyUrl }: { url: string; text: string; imageUrl?: string; storyUrl?: string }) {
  const { t } = useUserContext();
  const [copied, setCopied] = useState(false);

  async function nativeShare() {
    try {
      let files: File[] = [];
      if (imageUrl) {
        try {
          const image = await fetch(imageUrl, { cache: "no-store" });
          if (image.ok) files = [new File([await image.blob()], "open-abundance.png", { type: "image/png" })];
        } catch {
          files = [];
        }
      }
      if (files.length && typeof navigator.canShare === "function" && navigator.canShare({ files })) {
        await navigator.share({ title: text.slice(0, 80), text: `${text}\n${url}`, files });
      } else if (typeof navigator.share === "function") {
        await navigator.share({ title: text.slice(0, 80), text, url });
      } else {
        await copyLink();
      }
    } catch {
      // A cancelled share is not an error.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the network buttons still work.
    }
  }

  return (
    <div className="share-kit">
      <button className="challenge-primary-action" type="button" onClick={() => void nativeShare()}>
        <Share2 size={16} aria-hidden="true" />{t("social.feed.share")}
      </button>
      <div className="share-kit-networks" role="group" aria-label={t("share.networks")}>
        {shareTargets(url, text).map((target) => (
          <a key={target.key} href={target.href} target="_blank" rel="noopener noreferrer">{target.label}</a>
        ))}
      </div>
      <div className="share-kit-row">
        <button className="secondary-button" type="button" onClick={() => void copyLink()}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? t("share.copied") : t("share.copyLink")}
        </button>
        {storyUrl ? (
          <a className="secondary-button" href={storyUrl} download="open-abundance-story.png">
            <Download size={16} aria-hidden="true" />{t("reality.day.downloadStory")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
