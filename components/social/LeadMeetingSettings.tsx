"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { MeetingRhythmPicker } from "@/components/LeadMeetingCard";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import type { MeetingRhythm } from "@/lib/leadMeetings";

/** "Meetings with the lead": change the rhythm or turn meetings back on, in the team tab. */
export default function LeadMeetingSettings() {
  const { locale, t } = useUserContext();
  const [rhythm, setRhythm] = useState<MeetingRhythm | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithSupabaseAuth(`/api/lead-meeting?locale=${locale}`, { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { available?: boolean; rhythm?: MeetingRhythm | null } | null) => {
        if (cancelled || !payload?.available) return;
        setRhythm(payload.rhythm ?? null);
        setLoaded(true);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [locale]);

  if (!loaded) return null;
  return (
    <details className="lead-week-kit">
      <summary>{t("leadMeeting.settingsTitle")}</summary>
      <p>{t("leadMeeting.chooseBody")}</p>
      <MeetingRhythmPicker current={rhythm} onPicked={setRhythm} />
    </details>
  );
}
