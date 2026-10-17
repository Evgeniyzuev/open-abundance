"use client";

import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

let refreshPromise: Promise<Session | null> | null = null;

export async function fetchWithSupabaseAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { authRequired?: boolean } = {}
): Promise<Response> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (options.authRequired && !session?.access_token) {
    throw new Error("Supabase session is missing.");
  }

  const firstResponse = await fetchWithToken(input, init, session?.access_token ?? null);
  announceChallengeCheck(input, firstResponse);
  if (firstResponse.status !== 401 || !session?.access_token) return firstResponse;

  const refreshedSession = await refreshBrowserSession();
  if (refreshedSession?.access_token) {
    const retried = await fetchWithToken(input, init, refreshedSession.access_token);
    announceChallengeCheck(input, retried);
    return retried;
  }

  if (!options.authRequired) {
    return fetchWithToken(input, init, null);
  }

  return firstResponse;
}

async function refreshBrowserSession(): Promise<Session | null> {
  if (!refreshPromise) {
    const supabase = getBrowserSupabaseClient();
    refreshPromise = supabase.auth.refreshSession()
      .then(({ data, error }) => {
        if (error) return null;
        return data.session;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

function fetchWithToken(input: RequestInfo | URL, init: RequestInit, accessToken: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  else headers.delete("Authorization");

  return fetch(input, {
    ...init,
    headers
  });
}

/** A successful challenge check may have opened an achievement artifact: let the artifact watcher look again. */
function announceChallengeCheck(input: RequestInfo | URL, response: Response) {
  if (typeof window === "undefined" || !response.ok) return;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/challenges/check")) window.dispatchEvent(new Event("open-abundance:artifacts-check"));
}
