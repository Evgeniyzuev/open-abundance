"use client";

import { useEffect, useState } from "react";
import { Download, Film, Share2 } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";

const MAX_DAYS = 7;

/** "Video of the week": the last published days as a vertical MP4 for Reels, Shorts and TikTok. */
export default function RealityVideoButton({ userId }: { userId: string }) {
  const { locale, t } = useUserContext();
  const [state, setState] = useState<"idle" | "rendering" | "ready" | "unsupported" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  async function render() {
    setState("rendering");
    setProgress(0);
    try {
      const response = await fetch(`/api/reality/${userId}?ts=${Date.now()}`, { cache: "no-store" });
      const payload = await response.json() as { days?: Array<{ postId: string }>; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Days unavailable");
      const days = (payload.days ?? []).slice(-MAX_DAYS);
      if (!days.length) throw new Error("No published days yet.");
      const { renderRealityVideo, VideoUnsupportedError } = await import("@/lib/realityVideo");
      try {
        const blob = await renderRealityVideo(days.map((day) => `/api/reality/card/${day.postId}?format=story&locale=${locale}`), setProgress);
        setVideo({ blob, url: URL.createObjectURL(blob) });
        setState("ready");
      } catch (renderError) {
        setState(renderError instanceof VideoUnsupportedError ? "unsupported" : "error");
      }
    } catch {
      setState("error");
    }
  }

  async function share() {
    if (!video) return;
    const file = new File([video.blob], "open-abundance-week.mp4", { type: "video/mp4" });
    try {
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: t("reality.share.follow") });
      }
    } catch {
      // A cancelled share is not an error.
    }
  }

  if (state === "ready" && video) {
    return (
      <div className="reality-video">
        <video src={video.url} controls playsInline muted className="reality-video-preview" />
        <div className="share-kit-row">
          <button className="secondary-button" type="button" onClick={() => void share()}><Share2 size={16} aria-hidden="true" />{t("social.feed.share")}</button>
          <a className="secondary-button" href={video.url} download="open-abundance-week.mp4"><Download size={16} aria-hidden="true" />{t("reality.video.download")}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="reality-video">
      <button className="secondary-button" type="button" disabled={state === "rendering"} onClick={() => void render()}>
        <Film size={16} aria-hidden="true" />
        {state === "rendering" ? t("reality.video.rendering", { percent: Math.round(progress * 100) }) : t("reality.video.make")}
      </button>
      {state === "unsupported" ? <p className="reality-video-note">{t("reality.video.unsupported")}</p> : null}
      {state === "error" ? <p className="reality-video-note">{t("reality.video.error")}</p> : null}
    </div>
  );
}
