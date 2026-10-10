/**
 * One way to name a person in the interface: the real name when there is one, the @nickname
 * otherwise, and a short fallback last. An email is never used as a name.
 */
export type PersonRef = { display_name?: string | null; username?: string | null } | null | undefined;

export function personHandle(person: PersonRef): string {
  return person?.username ? `@${person.username}` : "";
}

export function personName(person: PersonRef, fallback: string): string {
  const name = person?.display_name?.trim();
  return (name && !name.includes("@") ? name : "") || personHandle(person) || fallback;
}

/** "Anna Petrova (@annapetrova)" for plain-text places; just the name when it already is the handle. */
export function personLabel(person: PersonRef, fallback: string): string {
  const name = personName(person, fallback);
  const handle = personHandle(person);
  return handle && name !== handle ? `${name} (${handle})` : name;
}

/** How well a nickname matches a search: 3 exact, 2 starts with, 1 contains, 0 not at all. */
export function usernameMatchRank(person: PersonRef, query: string): number {
  const needle = query.trim().replace(/^@+/, "").toLowerCase();
  const username = person?.username?.toLowerCase();
  if (!needle || !username) return 0;
  if (username === needle) return 3;
  if (username.startsWith(needle)) return 2;
  return username.includes(needle) ? 1 : 0;
}
