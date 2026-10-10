"use client";

import { useEffect, useRef, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { INSTALL_PING_CHALLENGE_ID, INSTALL_PING_QUERY_PARAM } from "@/lib/installPing";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { isUuid } from "@/lib/uuid";

/**
 * Handles the link inside an install-check notification. If the app was opened within three
 * minutes of the ping the server confirms it, and the reward is claimed through the normal
 * challenge check so there is a single completion path.
 */
export default function InstallPingAck() {
  const { t, user } = useUserContext();
  const handled = useRef(false);
  const [message, setMessage] = useState<MessageKey | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || handled.current) return;
    const url = new URL(window.location.href);
    const pingId = url.searchParams.get(INSTALL_PING_QUERY_PARAM);
    if (!pingId) return;
    handled.current = true;

    url.searchParams.delete(INSTALL_PING_QUERY_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (!isUuid(pingId)) return;

    void (async () => {
      try {
        const ack = await fetchWithSupabaseAuth("/api/challenges/install-ping/ack", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pingId })
        }, { authRequired: true });
        const payload = (await ack.json()) as { result?: string };
        if (payload.result === "expired") {
          setMessage("challenges.install.ackExpired");
          return;
        }
        if (payload.result !== "ok" && payload.result !== "already") return;

        const check = await fetchWithSupabaseAuth("/api/challenges/check", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId: INSTALL_PING_CHALLENGE_ID })
        }, { authRequired: true });
        const result = (await check.json()) as { completed?: boolean };
        setMessage(result.completed ? "challenges.install.ackRewarded" : "challenges.install.ackDone");
      } catch {
        // A failed confirmation leaves the challenge unchanged; the next ping can still confirm it.
      }
    })();
  }, [userId]);

  if (!message) return null;
  return (
    <section className="home-card self-serve-checkin" role="status">
      <h2>{t(message)}</h2>
      <button className="text-button self-serve-checkin-skip" type="button" onClick={() => setMessage(null)}>
        {t("app.common.close")}
      </button>
    </section>
  );
}
