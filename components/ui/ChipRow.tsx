"use client";

import { useState } from "react";

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * Single-choice chip row: `primary` chips are always visible, `more` chips live
 * under one toggle chip, which shows the active hidden option as its own label.
 */
export default function ChipRow<T extends string>({
  ariaLabel,
  moreLabel,
  more = [],
  primary,
  value,
  onChange
}: {
  ariaLabel: string;
  moreLabel: string;
  more?: ChipOption<T>[];
  primary: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeMore = more.find((option) => option.value === value) ?? null;
  const expanded = open;

  function renderChip(option: ChipOption<T>) {
    return (
      <button aria-pressed={value === option.value} className={value === option.value ? "active" : ""} key={option.value} type="button" onClick={() => {
        onChange(option.value);
        setOpen(false);
      }}>
        {option.label}
      </button>
    );
  }

  return (
    <div className="ui-chip-row">
      <div className="feed-filter-row" role="group" aria-label={ariaLabel}>
        {primary.map(renderChip)}
        {more.length ? (
          <button aria-expanded={expanded} className={activeMore ? "active" : ""} type="button" onClick={() => setOpen((current) => !current)}>
            {activeMore ? activeMore.label : moreLabel}
            <span aria-hidden="true"> {expanded ? "▴" : "▾"}</span>
          </button>
        ) : null}
      </div>
      {expanded ? <div className="feed-filter-row ui-chip-row-more" role="group">{more.map(renderChip)}</div> : null}
    </div>
  );
}
