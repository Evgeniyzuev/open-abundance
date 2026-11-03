"use client";

import { useEffect } from "react";
import { useUserContext } from "@/components/UserProvider";
import { ALINA_RETURN_KEY } from "@/lib/alinaMentor";

/** A guest who left Alina's chat to sign in goes back to it once signed in, where she answers their message. */
export default function AlinaReturn() {
  const { user } = useUserContext();
  useEffect(() => {
    if (!user) return;
    try {
      if (window.localStorage.getItem(ALINA_RETURN_KEY) !== "1") return;
      window.localStorage.removeItem(ALINA_RETURN_KEY);
    } catch {
      return;
    }
    window.location.assign("/alina#chat");
  }, [user]);
  return null;
}
