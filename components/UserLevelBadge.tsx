import type { ReactNode } from "react";

export function UserLevelBadge({
  label,
  level
}: {
  label: string;
  level: number;
}) {
  const normalizedLevel = Math.max(0, Math.floor(Number.isFinite(level) ? level : 0));

  return (
    <span className="user-level-badge" aria-label={label} title={label}>
      <span aria-hidden="true">🔼</span>
      <span aria-hidden="true">{normalizedLevel}</span>
    </span>
  );
}

export function UserNameWithLevel({
  children,
  label,
  level
}: {
  children: ReactNode;
  label?: string;
  level?: number | null;
}) {
  return (
    <span className="user-name-with-level">
      <span className="user-name-text">{children}</span>
      {typeof level === "number" && label ? <UserLevelBadge label={label} level={level} /> : null}
    </span>
  );
}
