"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { normalizeUsernameInput, validateUsername } from "@/lib/username";

type Check = { status: string; reason?: string; suggestions?: string[] } | null;

/**
 * The person's nickname with a live availability check and its own save, separate from the rest of
 * the profile so a taken name never blocks saving a bio. Used in the profile editor and in the
 * first-run notice.
 */
export default function NicknameField({ onSaved }: { onSaved?: (username: string) => void }) {
  const { t, profile, refreshUserData } = useUserContext();
  const current = profile?.username ?? "";
  const [value, setValue] = useState(current);
  const [check, setCheck] = useState<Check>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; key: MessageKey } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setValue(profile?.username ?? ""), [profile?.username]);

  const normalized = normalizeUsernameInput(value);
  const format = validateUsername(normalized);
  const changed = normalized !== current;

  // Check availability after the person stops typing; format problems are reported without a request.
  useEffect(() => {
    setMessage(null);
    if (!changed || normalized.length === 0) { setCheck(null); return; }
    if (!format.ok && format.reason !== "reserved") { setCheck({ status: "invalid", reason: format.reason }); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchWithSupabaseAuth(`/api/social/profile/username?u=${encodeURIComponent(normalized)}`, { cache: "no-store" }, { authRequired: true })
        .then((response) => response.json())
        .then((payload: Check & { error?: string }) => { if (!cancelled) setCheck(payload?.status ? payload : null); })
        .catch(() => { if (!cancelled) setCheck(null); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // `format` is derived from `normalized`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, changed]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/social/profile/username", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalized })
      }, { authRequired: true });
      const payload = (await response.json()) as { code?: string; username?: string };
      if (response.ok && (payload.code === "ok" || payload.code === "unchanged") && payload.username) {
        await refreshUserData();
        setMessage({ kind: "ok", key: "nickname.saved" });
        setCheck(null);
        onSaved?.(payload.username);
      } else {
        const code = payload.code ?? "generic";
        const key = (["cooldown", "limit", "taken", "reserved", "invalid"].includes(code) ? `nickname.error.${code}` : "nickname.error.generic") as MessageKey;
        setMessage({ kind: "error", key });
      }
    } catch {
      setMessage({ kind: "error", key: "nickname.error.generic" });
    } finally {
      setSaving(false);
    }
  }

  const canSave = changed && check?.status === "available" && !saving;
  const statusKey = check ? (check.status === "invalid" && check.reason ? `nickname.reason.${check.reason}` : `nickname.status.${check.status}`) as MessageKey : null;

  return (
    <div className="nickname-field">
      <label className="finance-field">
        <span>{t("nickname.label")}</span>
        <div className="nickname-input">
          <b aria-hidden="true">@</b>
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            maxLength={25}
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      </label>
      {current ? (
        <div className="nickname-link">
          <code>{typeof window === "undefined" ? "" : `${window.location.origin}/@${current}`}</code>
          <button
            type="button"
            aria-label={t("nickname.copyLink")}
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/@${current}`).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }).catch(() => undefined);
            }}
          >{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        </div>
      ) : null}
      <small className="nickname-rules">{t("nickname.rules")}</small>
      {statusKey ? <small className={check?.status === "available" ? "nickname-status ok" : "nickname-status"} role="status">{t(statusKey)}</small> : null}
      {check?.suggestions?.length ? (
        <div className="nickname-suggestions">
          <small>{t("nickname.suggestions")}</small>
          {check.suggestions.map((name) => <button className="chip" key={name} type="button" onClick={() => setValue(name)}>@{name}</button>)}
        </div>
      ) : null}
      {message ? <small className={message.kind === "ok" ? "nickname-status ok" : "nickname-status"} role="status">{t(message.key)}</small> : null}
      <button className="secondary-button" type="button" disabled={!canSave} onClick={() => void save()}>{saving ? t("app.common.loading") : t("nickname.save")}</button>
    </div>
  );
}
