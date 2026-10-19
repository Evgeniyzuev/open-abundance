"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

const TEXT_KEYS = ["invite.text.1", "invite.text.2", "invite.text.3", "invite.text.4", "invite.text.5"] as const;
const CHANNEL_KEYS = [
  "invite.channel.1",
  "invite.channel.2",
  "invite.channel.3",
  "invite.channel.4",
  "invite.channel.5",
  "invite.channel.6",
  "invite.channel.7",
  "invite.channel.8",
  "invite.channel.9",
  "invite.channel.10"
] as const;

/**
 * Button and window for the "Invite a friend" challenge: three ready messages with the
 * participant's own link and a checklist of places to send them to. Checked places are
 * remembered on this device only.
 */
export default function InviteKit() {
  const { t, user } = useUserContext();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const storageKey = user ? `oa-invite-checklist:${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setChecked(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
    } catch {
      setChecked([]);
    }
  }, [storageKey]);

  const loadLink = useCallback(async () => {
    setLoadFailed(false);
    try {
      const response = await fetchWithSupabaseAuth(`/api/referrals/me?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
      const payload = (await response.json()) as { available?: boolean; url?: string | null; appUrl?: string | null };
      const inviteUrl = payload.appUrl ?? payload.url;
      if (!response.ok || payload.available === false || !inviteUrl) throw new Error("no link");
      setLink(inviteUrl);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (open && !link) void loadLink();
  }, [open, link, loadLink]);

  function toggle(key: string) {
    setChecked((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // The checklist still works for this session when storage is unavailable.
        }
      }
      return next;
    });
  }

  const messageFor = (key: MessageKey) => t(key, { link: link ?? "" });

  async function copy(key: MessageKey) {
    try {
      await navigator.clipboard.writeText(messageFor(key));
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      setCopiedKey(null);
    }
  }

  async function share(key: MessageKey) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: messageFor(key) });
        return;
      } catch {
        // Cancelled or unavailable: fall back to copying.
      }
    }
    await copy(key);
  }

  return (
    <>
      <button className="challenge-primary-action" type="button" onClick={() => setOpen(true)}>
        {t("invite.open")}
      </button>
      {open ? (
        <Sheet bare className="small" titleId="invite-kit-title" onClose={() => setOpen(false)} style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <h2 id="invite-kit-title">{t("invite.title")}</h2>
            <p className="transfer-muted">{t("invite.intro")}</p>

            {loadFailed ? <p className="topup-error">{t("invite.linkFailed")}</p> : null}
            {link ? <p className="transfer-muted" style={{ overflowWrap: "anywhere" }}>{t("invite.yourLink")}: {link}</p> : null}

            <h3>{t("invite.textsTitle")}</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {TEXT_KEYS.map((key) => (
                <div key={key} style={{ padding: 12, borderRadius: 12, background: "rgba(0, 0, 0, 0.04)" }}>
                  <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{messageFor(key)}</p>
                  <div className="topup-modal-actions">
                    <button className="secondary-button" type="button" disabled={!link} onClick={() => void copy(key)}>
                      {copiedKey === key ? <Check size={16} /> : <Copy size={16} />} {copiedKey === key ? t("invite.copied") : t("invite.copy")}
                    </button>
                    <button className="secondary-button" type="button" disabled={!link} onClick={() => void share(key)}>
                      <Share2 size={16} /> {t("invite.share")}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ marginTop: 16 }}>{t("invite.checklistTitle")}</h3>
            <p className="transfer-muted">{t("invite.checklistProgress", { done: checked.length, total: CHANNEL_KEYS.length })}</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {CHANNEL_KEYS.map((key) => (
                <li key={key}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={checked.includes(key)} onChange={() => toggle(key)} style={{ marginTop: 3, width: 18, height: 18 }} />
                    <span>{t(key)}</span>
                  </label>
                </li>
              ))}
            </ul>

            <p className="transfer-muted" style={{ marginTop: 12 }}>{t("invite.rules")}</p>
            <button className="text-button" type="button" onClick={() => setOpen(false)}>{t("app.common.close")}</button>
        </Sheet>
      ) : null}
    </>
  );
}
