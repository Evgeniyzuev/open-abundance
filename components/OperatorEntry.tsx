"use client";

import { ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

// The console is a separate chunk that is downloaded only for operators.
const OperatorConsole = dynamic(() => import("@/components/OperatorConsole"), { ssr: false });

/**
 * Hidden entry to the operator console. It renders nothing for ordinary users: the
 * access check returns 404 for them, so no button, text or route hints that the
 * console exists. Operators get a small shield button; `?operator=1` also opens it.
 */
export default function OperatorEntry() {
  const { user, t } = useUserContext();
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/internal/operator/access", { cache: "no-store" }, { authRequired: true });
        if (cancelled || !response.ok) return;
        setAllowed(true);
        if (new URLSearchParams(window.location.search).get("operator") === "1") setOpen(true);
      } catch {
        // Ordinary users and offline sessions simply see nothing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!allowed) return null;
  return (
    <>
      <button className="feedback-fab" type="button" aria-label={t("operator.open")} title={t("operator.open")} style={{ right: 58 }} onClick={() => setOpen(true)}>
        <ShieldCheck size={20} />
      </button>
      {open ? <OperatorConsole onClose={() => setOpen(false)} /> : null}
    </>
  );
}
