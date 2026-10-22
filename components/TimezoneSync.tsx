"use client";

import { useEffect } from "react";
import { useUserContext } from "@/components/UserProvider";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

/** Saves the device time zone to the profile once per person and zone (and again when they travel). */
export default function TimezoneSync() {
  const { user } = useUserContext();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let timezone = "";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return;
    }
    if (!timezone) return;
    const storageKey = `openAbundanceTimezone:${userId}`;
    try {
      if (window.localStorage.getItem(storageKey) === timezone) return;
    } catch {
      // Without storage it is simply sent again next time.
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await getBrowserSupabaseClient().auth.getSession();
        if (!session?.access_token || cancelled) return;
        const response = await fetch("/api/user/timezone", {
          method: "PUT",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ timezone })
        });
        if (response.ok) window.localStorage.setItem(storageKey, timezone);
      } catch {
        // Nudges fall back to the default window.
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return null;
}
