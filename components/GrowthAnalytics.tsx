"use client";

import { useEffect } from "react";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { useUserContext } from "@/components/UserProvider";

export default function GrowthAnalytics() {
  const { user } = useUserContext();

  useEffect(() => {
    let cancelled = false;
    const identityKey = user?.id ?? "anonymous";
    const dayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `openAbundanceAppOpen:${identityKey}:${dayKey}`;

    try {
      if (window.localStorage.getItem(storageKey)) return () => {
        cancelled = true;
      };
    } catch {
      // Continue with a server-side distinct-user/day aggregate.
    }

    trackClientEvent("app_open", { authenticated: Boolean(user) }).then((accepted) => {
      if (cancelled || !accepted) return;
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // Analytics must not block the application.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return null;
}
