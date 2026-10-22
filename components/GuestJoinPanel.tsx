"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { readLocalGuest } from "@/lib/guestIdentity";

/**
 * The slim translucent bar guests see at the top of the public pages (blog, profile, feed): the name, "You are invited"
 * when the device holds an invitation code, and the two ways in. It is not shown to signed-in people.
 */
export default function GuestJoinPanel() {
  const { user, loading, t } = useUserContext();
  const [inviteSaved, setInviteSaved] = useState(false);
  const [inviter, setInviter] = useState<string | null>(null);

  // The provider stores the code from ?ref= on this device a moment after the page opens.
  useEffect(() => {
    if (user) return;
    let cancelled = false;
    const read = () => readLocalGuest().then(async (guest) => {
      const pending = guest?.pendingReferral;
      if (cancelled || !pending || pending.claimedAt) return;
      setInviteSaved(true);
      // The name of the person who invited, when the code is known; otherwise the bar just says "You are invited".
      try {
        const response = await fetch(`/api/referrals/inviter?code=${encodeURIComponent(pending.referralCode)}`, { cache: "no-store" });
        const payload = (await response.json()) as { name?: string };
        if (!cancelled && payload.name) setInviter(payload.name);
      } catch {
        // The generic line stays.
      }
    }).catch(() => undefined);
    void read();
    const timer = window.setTimeout(() => void read(), 1200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  if (loading || user) return null;
  return (
    <>
      <aside className="glass-tabbar top-tabbar guest-bar">
        <span className="guest-bar-text">
          <strong>Open Abundance</strong>
          {inviteSaved ? <small>{inviter ? t("public.join.invitedBy", { name: inviter }) : t("public.join.invited")}</small> : null}
        </span>
        <span className="guest-bar-actions">
          <a className="guest-bar-signin" href="/?auth=signin">{t("public.join.signIn")}</a>
          <a className="guest-bar-join" href="/">{t("public.join.cta")}</a>
        </span>
      </aside>
      <div className="guest-bar-spacer" aria-hidden="true" />
    </>
  );
}
