"use client";

import { useEffect, useState } from "react";
import NicknameField from "@/components/NicknameField";
import { useUserContext } from "@/components/UserProvider";

const NOTICE_WINDOW_DAYS = 14;

/**
 * One-time card after registration that tells the person their generated nickname and lets them
 * change it right away. Shown once per account, only for recently registered accounts.
 */
export default function NicknameNotice({ active }: { active: boolean }) {
  const { t, user, profile } = useUserContext();
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const userId = user?.id ?? null;
  const username = profile?.username ?? null;
  const createdAt = profile?.created_at ?? null;

  useEffect(() => {
    if (!active || !userId || !username || !createdAt) { setVisible(false); return; }
    const ageDays = (Date.now() - Date.parse(createdAt)) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays > NOTICE_WINDOW_DAYS) { setVisible(false); return; }
    try {
      setVisible(window.localStorage.getItem(storageKey(userId)) === null);
    } catch {
      setVisible(false);
    }
  }, [active, userId, username, createdAt]);

  if (!visible || !userId) return null;

  function dismiss() {
    try { window.localStorage.setItem(storageKey(userId as string), "done"); } catch { /* the card may reappear without storage */ }
    setVisible(false);
  }

  return (
    <section className="home-card self-serve-checkin nickname-notice" aria-labelledby="nickname-notice-title">
      <h2 id="nickname-notice-title">{t("nickname.notice.title", { name: username ?? "" })}</h2>
      <p>{t("nickname.notice.body")}</p>
      {editing ? <NicknameField onSaved={dismiss} /> : null}
      <div className="self-serve-checkin-actions">
        {!editing ? <button className="secondary-button" type="button" onClick={() => setEditing(true)}>{t("nickname.notice.change")}</button> : null}
        <button className="secondary-button" type="button" onClick={dismiss}>{editing ? t("app.common.cancel") : t("nickname.notice.keep")}</button>
      </div>
    </section>
  );
}

function storageKey(userId: string): string {
  return `openAbundanceNicknameNotice.v1.${userId}`;
}
