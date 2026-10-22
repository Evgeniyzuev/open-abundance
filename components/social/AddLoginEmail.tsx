"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

const TELEGRAM_EMAIL_SUFFIX = "@telegram.open-abundance.app";

/**
 * For an account made in the Telegram Mini App: add a real email, so the same account opens on the web
 * (email code) and is not lost with the Telegram account. Supabase confirms the new address with a code.
 * Needs "Secure email change" off in Supabase: the technical Telegram address cannot receive mail.
 */
export default function AddLoginEmail() {
  const { user, t, refreshUserData } = useUserContext();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user?.email?.endsWith(TELEGRAM_EMAIL_SUFFIX) && !done) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage(/already|registered|exists/i.test(text) ? t("profile.loginEmail.taken") : t("profile.loginEmail.error"));
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () => run(async () => {
    const { error } = await getBrowserSupabaseClient().auth.updateUser({ email: email.trim() });
    if (error) throw error;
    setSent(true);
  });

  const confirm = () => run(async () => {
    const { error } = await getBrowserSupabaseClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email_change" });
    if (error) throw error;
    setDone(true);
    await refreshUserData();
  });

  return (
    <div className="referral-box">
      <div className="referral-box-copy">
        <span><Mail size={15} />{t("profile.loginEmail.title")}</span>
        <small>{done ? t("profile.loginEmail.done", { email: email.trim() }) : sent ? t("profile.loginEmail.codeHint", { email: email.trim() }) : t("profile.loginEmail.hint")}</small>
      </div>
      {done ? null : (
        <div className="referral-compact-actions">
          {sent ? (
            <>
              <input className="daily-set-answer" inputMode="numeric" autoComplete="one-time-code" aria-label={t("profile.loginEmail.code")} placeholder={t("profile.loginEmail.code")} value={code} onChange={(event) => setCode(event.target.value)} />
              <button className="secondary-button" type="button" disabled={busy || code.trim().length < 6} onClick={() => void confirm()}>{t("profile.loginEmail.confirm")}</button>
            </>
          ) : (
            <>
              <input className="daily-set-answer" type="email" inputMode="email" autoComplete="email" aria-label="Email" placeholder="email@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              <button className="secondary-button" type="button" disabled={busy || !email.includes("@")} onClick={() => void sendCode()}>{t("profile.loginEmail.send")}</button>
            </>
          )}
        </div>
      )}
      {message ? <small className="finance-error inline">{message}</small> : null}
    </div>
  );
}
