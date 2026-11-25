"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import ShareKit from "@/components/ShareKit";
import { useUserContext } from "@/components/UserProvider";
import { trackProductEvent } from "@/lib/productAnalytics";
import { momentImagePath, momentInviteUrl, type MomentKind } from "@/lib/momentShare";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

/**
 * «Поделиться» at a key moment: a ready 9:16 / 4:5 card with the person's words and their invitation link, so the story
 * they share brings the next person to the same path.
 */
export default function MomentShare({ kind, title, line, className }: { kind: MomentKind; title: string; line?: string; className?: string }) {
  const { t, locale, user } = useUserContext();
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "open" | "failed">("idle");

  if (!user) return null;

  async function open() {
    setState("loading");
    try {
      const response = await fetchWithSupabaseAuth(`/api/referrals/me?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { appUrl?: string };
      const base = payload.appUrl || window.location.origin;
      setLink(momentInviteUrl(base, kind));
      setState("open");
      trackProductEvent("moment_share_opened", { kind });
    } catch {
      setLink(momentInviteUrl(window.location.origin, kind));
      setState("open");
    }
  }

  return (
    <div className={className ? `moment-share ${className}` : "moment-share"}>
      {state === "open" && link ? (
        <ShareKit
          url={link}
          text={line ? `${title}\n${line}` : title}
          imageUrl={momentImagePath({ kind, title, line }, locale, "post")}
          storyUrl={momentImagePath({ kind, title, line }, locale, "story")}
        />
      ) : (
        <button className="challenge-secondary-action moment-share-button" type="button" disabled={state === "loading"} onClick={() => void open()}>
          <Share2 size={16} aria-hidden="true" />{t("moment.share")}
        </button>
      )}
    </div>
  );
}
