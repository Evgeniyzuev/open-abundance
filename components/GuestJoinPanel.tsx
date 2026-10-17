"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { readLocalGuest } from "@/lib/guestIdentity";

/**
 * The panel guests see on the public pages (blog, profile, feed): what the place is, a note that an invitation is
 * saved when the device holds a code, and the two ways in. It is not shown to signed-in people.
 */
export default function GuestJoinPanel() {
  const { user, loading, t } = useUserContext();
  const [inviteSaved, setInviteSaved] = useState(false);

  // The provider stores the code from ?ref= on this device a moment after the page opens.
  useEffect(() => {
    if (user) return;
    let cancelled = false;
    const read = () => readLocalGuest().then((guest) => { if (!cancelled && guest?.pendingReferral && !guest.pendingReferral.claimedAt) setInviteSaved(true); }).catch(() => undefined);
    void read();
    const timer = window.setTimeout(() => void read(), 1200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  if (loading || user) return null;
  return (
    <aside className="public-join-banner">
      <span>
        <strong>{t("public.join.title")}</strong>
        <small>{inviteSaved ? t("public.join.invited") : t("public.join.text")}</small>
      </span>
      <span className="public-join-actions">
        <a className="secondary-button" href="/?auth=signin">{t("public.join.signIn")}</a>
        <a className="challenge-primary-action" href="/">{t("public.join.cta")}</a>
      </span>
    </aside>
  );
}
