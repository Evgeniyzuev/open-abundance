"use client";

import { BookOpen, Newspaper, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";

const LAST_AUTHOR_KEY = "oa.public.lastAuthor";

/** Remembers the last person whose page was opened, so the feed can lead back to their blog and profile. */
export function rememberPublicAuthor(userId: string): void {
  try {
    window.sessionStorage.setItem(LAST_AUTHOR_KEY, userId);
  } catch {
    // Without storage the feed simply shows no way back to a person.
  }
}

function readPublicAuthor(): string | null {
  try {
    const value = window.sessionStorage.getItem(LAST_AUTHOR_KEY);
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

type Section = "blog" | "profile" | "feed";

/**
 * The bottom bar of the public pages, like the tab bar of a social app: Feed, Blog, Profile. The blog and the
 * profile belong to the person whose page was opened last, so from the feed one goes back to them in one tap.
 */
export default function PublicTabBar({ active, authorId }: { active: Section; authorId?: string }) {
  const { t } = useUserContext();
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    if (authorId) rememberPublicAuthor(authorId);
    else setStored(readPublicAuthor());
  }, [authorId]);

  const person = authorId ?? stored;
  const items: Array<{ key: Section; href: string; label: string; icon: typeof BookOpen }> = [
    { key: "feed", href: "/feed", label: t("public.nav.feed"), icon: Newspaper },
    ...(person ? [
      { key: "blog" as const, href: `/u/${person}/blog`, label: t("public.nav.blog"), icon: BookOpen },
      { key: "profile" as const, href: `/u/${person}`, label: t("public.nav.profile"), icon: UserRound }
    ] : [])
  ];
  if (items.length < 2) return null;
  return (
    <nav className="glass-tabbar bottom-tabbar public-tab-bar" aria-label={t("public.nav.label")}>
      {items.map(({ key, href, label, icon: Icon }) => (
        <Link key={key} className={key === active ? "tab-button active" : "tab-button"} href={href} aria-label={label} aria-current={key === active ? "page" : undefined}>
          <span className="tab-button-icon"><Icon size={28} strokeWidth={key === active ? 2.5 : 2} aria-hidden="true" /></span>
          <span className="tab-button-label" aria-hidden="true">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
