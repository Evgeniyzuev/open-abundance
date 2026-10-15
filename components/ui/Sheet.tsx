"use client";

import { X } from "lucide-react";
import { createElement, useEffect, useRef, type FormEventHandler, type ReactNode } from "react";

/**
 * Shared modal: bottom sheet on phones, centred card on wide screens.
 * Handles Escape, backdrop tap, swipe-down on the grabber, focus move/return and scroll lock.
 * `bare` leaves the header to the children (Cancel/Done style forms); `as="form"` renders the sheet as a form.
 */
export default function Sheet({
  ariaLabel,
  as = "section",
  bare = false,
  children,
  className = "",
  closeLabel = "",
  dismissible = true,
  title,
  titleId,
  onClose,
  onSubmit
}: {
  ariaLabel?: string;
  as?: "section" | "form";
  bare?: boolean;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  dismissible?: boolean;
  title?: ReactNode;
  titleId?: string;
  onClose: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const sheetRef = useRef<HTMLElement & HTMLFormElement>(null);
  const onCloseRef = useRef(onClose);
  const dragStartY = useRef<number | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Keep focus on a field the content already focused (autoFocus); otherwise focus the dialog itself.
    if (sheetRef.current && !sheetRef.current.contains(document.activeElement)) sheetRef.current.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [dismissible]);

  const showChrome = !bare && dismissible;

  return (
    <div className="modal-backdrop" role="presentation" onClick={dismissible ? onClose : undefined}>
      {createElement(
        as,
        {
          "aria-label": titleId ? undefined : ariaLabel,
          "aria-labelledby": titleId,
          "aria-modal": "true",
          className: `modal-sheet ${className}`.trim(),
          onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
          onSubmit,
          ref: sheetRef,
          role: "dialog",
          tabIndex: -1
        },
        showChrome ? (
          <div
            aria-hidden="true"
            className="sheet-grabber"
            key="grabber"
            onPointerDown={(event) => { dragStartY.current = event.clientY; }}
            onPointerUp={(event) => {
              if (dragStartY.current !== null && event.clientY - dragStartY.current > 60) onClose();
              dragStartY.current = null;
            }}
          />
        ) : null,
        showChrome ? <button className="modal-close" key="close" type="button" aria-label={closeLabel} onClick={onClose}><X size={18} /></button> : null,
        !bare && title ? <div className="modal-header" key="header"><h2 id={titleId}>{title}</h2></div> : null,
        children
      )}
    </div>
  );
}
