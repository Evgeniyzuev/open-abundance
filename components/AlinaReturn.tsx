"use client";

import { useEffect } from "react";
import { useUserContext } from "@/components/UserProvider";
import { ALINA_RETURN_KEY } from "@/lib/alinaMentor";
import { mentorByPath } from "@/lib/mentors";

/** A guest who left a mentor's chat to sign in goes back to it once signed in, where she answers their message. */
export default function AlinaReturn() {
  const { user } = useUserContext();
  useEffect(() => {
    if (!user) return;
    let path: string;
    try {
      const value = window.localStorage.getItem(ALINA_RETURN_KEY);
      if (!value) return;
      window.localStorage.removeItem(ALINA_RETURN_KEY);
      path = mentorByPath(value)?.path ?? "/alina";
    } catch {
      return;
    }
    window.location.assign(`${path}#chat`);
  }, [user]);
  return null;
}
