"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

export type RecipientCandidate = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
};

type Props = {
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onSelect: (person: RecipientCandidate) => void;
};

/** Search people by name or @username to pay them, instead of pasting an id. */
export default function RecipientSearch({ t, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<RecipientCandidate[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim().replace(/^@/, "");
    if (term.length < 2) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/wallet/recipients/search?q=${encodeURIComponent(term)}`, { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json()) as { people?: RecipientCandidate[] };
        if (!cancelled) setPeople(response.ok ? payload.people ?? [] : []);
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const showEmpty = query.trim().replace(/^@/, "").length >= 2 && !searching && people.length === 0;
  return (
    <div className="recipient-search">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("pay.search.placeholder")}
        autoComplete="off"
      />
      {people.length > 0 ? (
        <div className="transfer-contact-list">
          {people.map((person) => (
            <button
              className="transfer-contact"
              key={person.user_id}
              type="button"
              onClick={() => {
                onSelect(person);
                setQuery("");
                setPeople([]);
              }}
            >
              <span className="transfer-avatar">{(person.display_name || person.username || "?").slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{person.display_name || person.username}</strong>
                {person.username ? <small>@{person.username}</small> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {showEmpty ? <p className="transfer-muted">{t("pay.search.empty")}</p> : null}
    </div>
  );
}
