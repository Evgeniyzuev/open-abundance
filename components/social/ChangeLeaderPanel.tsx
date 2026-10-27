"use client";

import { useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { personLabel } from "@/lib/personName";

type LeaderOption = {
  userId: string;
  level: number;
  freePoints: number;
  isCurrent: boolean;
  isReferrer: boolean;
  profile: { username: string | null; display_name: string | null } | null;
};

/**
 * "Change lead": the follower picks another live lead from those higher in level with free places,
 * at most once a day. Collapsed by default; the list loads only when opened.
 */
export default function ChangeLeaderPanel({ onChanged }: { onChanged: () => void }) {
  const { locale, t } = useUserContext();
  const [options, setOptions] = useState<LeaderOption[] | null>(null);
  const [nextChoiceAt, setNextChoiceAt] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "saving" | "changed" | "error">("idle");

  async function load() {
    if (options || state === "loading") return;
    setState("loading");
    try {
      const response = await fetchWithSupabaseAuth("/api/teams/leaders", { cache: "no-store" }, { authRequired: true });
      const payload = (await response.json()) as { options?: LeaderOption[]; nextChoiceAt?: string | null };
      if (!response.ok) throw new Error("load failed");
      setOptions(payload.options ?? []);
      setNextChoiceAt(payload.nextChoiceAt ?? null);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  async function choose(option: LeaderOption) {
    setState("saving");
    try {
      const response = await fetchWithSupabaseAuth(
        "/api/teams/leaders",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaderUserId: option.userId }) },
        { authRequired: true }
      );
      const payload = (await response.json()) as { status?: string; nextChoiceAt?: string | null };
      setNextChoiceAt(payload.nextChoiceAt ?? null);
      if (payload.status === "changed") {
        setOptions((current) => (current ?? []).map((item) => ({ ...item, isCurrent: item.userId === option.userId })));
        setState("changed");
        onChanged();
      } else {
        setState(payload.status === "too_soon" ? "idle" : "error");
      }
    } catch {
      setState("error");
    }
  }

  const locked = Boolean(nextChoiceAt && Date.parse(nextChoiceAt) > Date.now());
  const nextLabel = nextChoiceAt
    ? new Date(nextChoiceAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <details className="change-leader" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) void load(); }}>
      <summary>{t("social.teams.changeLeader")}</summary>
      <p>{t("social.teams.changeLeaderRule")}</p>
      {state === "loading" ? <p>{t("app.common.loading")}</p> : null}
      {state === "error" ? <p className="finance-error inline">{t("social.teams.changeLeaderError")}</p> : null}
      {state === "changed" ? <p role="status">{t("social.teams.changeLeaderDone")}</p> : null}
      {locked ? <p>{t("social.teams.changeLeaderNext", { time: nextLabel })}</p> : null}
      {options && options.length === 0 ? <p>{t("social.teams.changeLeaderNone")}</p> : null}
      {options && options.length > 0 ? (
        <ul className="change-leader-list">
          {options.map((option) => (
            <li key={option.userId}>
              <span>
                <strong>{personLabel(option.profile, option.userId.slice(0, 8))}</strong>
                <small>
                  {t("profile.levelBadge", { level: option.level })}
                  {option.isReferrer ? ` · ${t("social.teams.changeLeaderReferrer")}` : ""}
                </small>
              </span>
              {option.isCurrent
                ? <small className="change-leader-current">{t("social.teams.changeLeaderCurrent")}</small>
                : <button className="secondary-button" type="button" disabled={locked || state === "saving"} onClick={() => void choose(option)}>{t("social.teams.changeLeaderPick")}</button>}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
