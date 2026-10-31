// The face of the Open Abundance lead (Evgen, 2026-10-31): the AI mentor Alina Agitova, docs/mentors/ALINA_AGITOVA.md.
// She tells stories in the feed (system account below) and guides people who have no live lead above them.
// Pure and standalone (no imports) so scripts can import it.

export const OA_LEAD_PERSONA = {
  name: { ru: "Алина Агитова", en: "Alina Agitova" },
  /** Shown on the relay lead's profile, so people see that she is an AI. */
  profileName: "Алина Агитова · ИИ",
  avatarUrl: "/feed/mentors/alina-agitova-avatar.jpg",
  systemAccountKey: "alina_agitova"
} as const;
