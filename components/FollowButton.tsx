"use client";

import { useEffect, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

/** Compact follow toggle for an author; hidden for yourself and when signed out. */
export default function FollowButton({ authorId }: { authorId: string }) {
  const { t, user } = useUserContext();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const viewerId = user?.id ?? null;

  useEffect(() => {
    if (!viewerId || viewerId === authorId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/social/follows?userId=${authorId}&ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const payload = await response.json() as { following?: boolean };
        if (!cancelled && response.ok) setFollowing(Boolean(payload.following));
      } catch {
        // Without state the button stays hidden.
      }
    })();
    return () => { cancelled = true; };
  }, [authorId, viewerId]);

  if (!viewerId || viewerId === authorId || following === null) return null;

  async function toggle() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetchWithSupabaseAuth("/api/social/follows", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authorId, follow: !following })
      }, { authRequired: true });
      const payload = await response.json() as { following?: boolean };
      if (response.ok) setFollowing(Boolean(payload.following));
    } finally {
      setSaving(false);
    }
  }

  return (
    <button className={`follow-chip${following ? " following" : ""}`} type="button" aria-pressed={following} disabled={saving} onClick={() => void toggle()}>
      {following ? <Check size={14} aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />}
      {following ? t("social.follow.following") : t("social.follow.follow")}
    </button>
  );
}
