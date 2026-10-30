// The friend's «task for two» invitation from the link (?duo=<code>) waits on the device until the person is signed in
// and answers it (components/DuoQuest.tsx, DuoJoinPrompt).

const KEY = "open-abundance:pending-duo";

export function capturePendingDuo(params: URLSearchParams): void {
  const code = params.get("duo");
  if (!code) return;
  params.delete("duo");
  try {
    if (/^[a-z0-9]{6,16}$/.test(code)) window.localStorage.setItem(KEY, code);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  } catch {
    // Without storage the invitation is simply not offered.
  }
}

export function readPendingDuo(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingDuo(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
