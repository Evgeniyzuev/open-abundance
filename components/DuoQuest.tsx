"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { Confetti } from "@/components/ui/Celebration";
import { useUserContext } from "@/components/UserProvider";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { clearPendingDuo, readPendingDuo } from "@/lib/duoInvite";
import { DUO_NOTE_MAX, type DuoProgress } from "@/lib/duoQuest";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { playUiSound } from "@/lib/ui/sound";

// «A task for two» (lib/duoQuest.ts, /api/duo): the scene inside the task card and the invitation prompt for the friend.

type Duo = {
  id: string;
  status: "waiting" | "active" | "succeeded" | "ended";
  isInviter: boolean;
  invitePath: string;
  friendName: string | null;
  days: number;
  neededDays: number;
  canCheckIn: boolean;
  progress: DuoProgress;
  notes: Array<{ mine: boolean; day: string; note: string }>;
};

async function duoRequest(init?: RequestInit, query = ""): Promise<{ duo?: Duo | null; invite?: any; challengeId?: string | null; error?: string }> {
  const response = await fetchWithSupabaseAuth(`/api/duo${query}`, { cache: "no-store", ...init }, { authRequired: true });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

function post(body: Record<string, unknown>) {
  return duoRequest({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function DayDots({ marks, dayIndex, label }: { marks: boolean[]; dayIndex: number; label: string }) {
  return (
    <div className="duo-row">
      <span className="duo-row-name">{label}</span>
      <span className="duo-dots">
        {marks.map((done, index) => (
          <i key={index} className={`${done ? "done" : ""}${index === dayIndex ? " today" : ""}`} />
        ))}
      </span>
    </div>
  );
}

/** The scene in the taken task: invite a friend, wait, then mark a step a day and watch the friend's steps. */
export function DuoQuestPanel({ onSucceeded }: { onSucceeded?: () => void }) {
  const { t } = useUserContext();
  const [duo, setDuo] = useState<Duo | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justMarked, setJustMarked] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await duoRequest(undefined, `?ts=${Date.now()}`);
      setDuo(payload.duo ?? null);
    } catch {
      setDuo(null);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(body: Record<string, unknown>, after?: (duo: Duo | null) => void) {
    setBusy(true);
    setError(null);
    try {
      const payload = await post(body);
      setDuo(payload.duo ?? null);
      after?.(payload.duo ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("duo.error"));
    } finally {
      setBusy(false);
    }
  }

  async function share(path: string) {
    const link = `${window.location.origin}${path}`;
    const text = t("duo.shareText");
    void trackClientEvent("duo_invite_shared", {});
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Open Abundance", text, url: link });
        return;
      }
    } catch {
      // Closed the share sheet: fall back to copying.
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
      playUiSound("action");
    } catch {
      setError(link);
    }
  }

  if (duo === undefined) return <p className="quest-scene-hint">{t("app.common.loading")}</p>;

  if (!duo || duo.status === "ended") {
    return (
      <section className="quest-scene duo-scene">
        <span className="duo-scene-icon" aria-hidden="true"><Users size={26} /></span>
        <p className="quest-scene-text">{duo?.status === "ended" ? t("duo.ended") : t("duo.intro")}</p>
        <button className="challenge-primary-action" disabled={busy} type="button" onClick={() => void run({ action: "create" }, (next) => { if (next) void share(next.invitePath); })}>
          {t(duo?.status === "ended" ? "duo.again" : "duo.invite")}
        </button>
        {error ? <p className="quest-scene-hint">{error}</p> : null}
      </section>
    );
  }

  if (duo.status === "waiting") {
    return (
      <section className="quest-scene duo-scene">
        <p className="quest-scene-text">{t("duo.waiting")}</p>
        <button className="challenge-primary-action" type="button" onClick={() => void share(duo.invitePath)}>{t(copied ? "duo.copied" : "duo.sendAgain")}</button>
        <button className="text-button" disabled={busy} type="button" onClick={() => void run({ action: "leave" })}>{t("duo.cancel")}</button>
        {error ? <p className="quest-scene-hint">{error}</p> : null}
      </section>
    );
  }

  const { progress } = duo;
  const friend = duo.friendName ?? t("duo.friend");
  const lastFriendNote = duo.notes.find((item) => !item.mine);
  return (
    <section className="quest-scene duo-scene">
      {justMarked ? <Confetti pieces={16} /> : null}
      <p className="quest-scene-text">
        {duo.status === "succeeded" ? t("duo.succeeded", { friend }) : t("duo.progress", { needed: duo.neededDays, days: duo.days, mine: progress.myCount, theirs: progress.theirCount })}
      </p>
      <DayDots label={t("duo.me")} marks={progress.mine} dayIndex={progress.dayIndex} />
      <DayDots label={friend} marks={progress.theirs} dayIndex={progress.dayIndex} />
      {lastFriendNote ? <p className="duo-friend-note"><b>{friend}:</b> {lastFriendNote.note}</p> : null}
      {duo.canCheckIn ? (
        <div className="duo-checkin">
          <label htmlFor="duo-note">{t("duo.todayPrompt")}</label>
          <input id="duo-note" maxLength={DUO_NOTE_MAX} placeholder={t("duo.todayPlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
          <button
            className="challenge-primary-action"
            disabled={busy || note.trim().length < 2}
            type="button"
            onClick={() => void run({ action: "checkin", note }, (next) => {
              setNote("");
              setJustMarked(true);
              playUiSound(next?.status === "succeeded" ? "reward" : "correct");
              if (next?.status === "succeeded") onSucceeded?.();
            })}
          >
            {t("duo.mark")}
          </button>
        </div>
      ) : duo.status === "active" ? (
        <p className="quest-scene-hint">{progress.theirs[progress.dayIndex] ? t("duo.bothDone") : t("duo.waitFriend", { friend })}</p>
      ) : null}
      {error ? <p className="quest-scene-hint">{error}</p> : null}
    </section>
  );
}

/** The friend's invitation from the link: after sign-in, one sheet asks to join. */
export function DuoJoinPrompt({ onOpenChallenge }: { onOpenChallenge: (challengeId: string | null) => void }) {
  const { t, user } = useUserContext();
  const [invite, setInvite] = useState<{ code: string; inviterName: string | null; joinable: boolean } | null>(null);
  const [joined, setJoined] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const code = readPendingDuo();
    if (!code) return;
    duoRequest(undefined, `?code=${encodeURIComponent(code)}`)
      .then((payload) => {
        if (payload.invite?.joinable) setInvite(payload.invite);
        else clearPendingDuo();
      })
      .catch(() => undefined);
  }, [user]);

  if (!invite) return null;
  const name = invite.inviterName ?? t("duo.friend");
  function close() {
    clearPendingDuo();
    setInvite(null);
  }
  async function join() {
    setBusy(true);
    setError(null);
    try {
      const payload = await post({ action: "join", code: invite!.code });
      setChallengeId(payload.challengeId ?? null);
      clearPendingDuo();
      setJoined(true);
      playUiSound("reward");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("duo.error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet bare className="small duo-join-sheet" titleId="duo-join-title" onClose={close}>
      {joined ? <Confetti /> : null}
      <span className="duo-scene-icon" aria-hidden="true"><Users size={30} /></span>
      <h2 id="duo-join-title">{joined ? t("duo.join.done") : t("duo.join.title", { name })}</h2>
      <p>{joined ? t("duo.join.doneText") : t("duo.join.text")}</p>
      {error ? <p>{error}</p> : null}
      {joined ? (
        <button className="challenge-primary-action" type="button" onClick={() => { close(); onOpenChallenge(challengeId); }}>{t("duo.join.open")}</button>
      ) : (
        <>
          <button className="challenge-primary-action" disabled={busy} type="button" onClick={() => void join()}>{t("duo.join.accept")}</button>
          <button className="text-button" type="button" onClick={close}>{t("duo.join.later")}</button>
        </>
      )}
    </Sheet>
  );
}
