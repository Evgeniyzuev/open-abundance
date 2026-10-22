"use client";

import { X } from "lucide-react";
import { createElement, useEffect, useRef, type CSSProperties, type FormEventHandler, type ReactNode } from "react";

// Open sheets, topmost last: Escape closes only the topmost one.
const openSheets: symbol[] = [];

/**
 * Shared modal: bottom sheet on phones, centred card on wide screens.
 * Handles Escape, backdrop tap, swipe-down on the grabber, focus move/return and scroll lock.
 * `fullscreen` makes it a full-screen page (same as the post detail view), good for long content.
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
  fullscreen = false,
  style,
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
  /** Fills the screen like the post detail view: no half-height sheet, and the page behind cannot be dragged. */
  fullscreen?: boolean;
  style?: CSSProperties;
  title?: ReactNode;
  titleId?: string;
  /** Optional only for sheets that must be answered (`dismissible={false}`). */
  onClose?: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const sheetRef = useRef<HTMLElement & HTMLFormElement>(null);
  const canDismiss = dismissible && Boolean(onClose);
  const onCloseRef = useRef(onClose);
  const dragStartY = useRef<number | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width };
    const scrollY = window.scrollY;
    body.style.overflow = "hidden";
    // iOS ignores overflow: hidden on the page behind. A fullscreen sheet pins the page in place so a drag on the sheet can
    // never scroll it or shift the visible viewport (which used to drag the whole sheet away from the screen).
    if (fullscreen) {
      body.style.position = "fixed";
      body.style.top = `${-scrollY}px`;
      body.style.width = "100%";
    }
    // Keep focus on a field the content already focused (autoFocus); otherwise focus the dialog itself.
    if (sheetRef.current && !sheetRef.current.contains(document.activeElement)) sheetRef.current.focus();

    const token = Symbol("sheet");
    openSheets.push(token);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && canDismiss && openSheets[openSheets.length - 1] === token) onCloseRef.current?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openSheets.splice(openSheets.indexOf(token), 1);
      body.style.overflow = previousOverflow;
      if (fullscreen) {
        body.style.position = previous.position;
        body.style.top = previous.top;
        body.style.width = previous.width;
        window.scrollTo(0, scrollY);
      }
      previouslyFocused?.focus?.();
    };
  }, [canDismiss, fullscreen]);

  // The standard close button (top right, as on feed posts) is shown for every full-screen sheet, bare or not.
  const showChrome = !bare && canDismiss;
  // (Not for forms: their header already has its own Cancel and Done.)
  const showClose = canDismiss && ((fullscreen && as !== "form") || !bare);

  return (
    <div className={`modal-backdrop${fullscreen ? " sheet-fullscreen-backdrop" : ""}`} role="presentation" onClick={canDismiss ? onClose : undefined}>
      {createElement(
        as,
        {
          "aria-label": titleId ? undefined : ariaLabel,
          "aria-labelledby": titleId,
          "aria-modal": "true",
          className: `modal-sheet${fullscreen ? " sheet-fullscreen" : ""} ${className}`.trim(),
          style,
          onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
          onSubmit,
          ref: sheetRef,
          role: "dialog",
          tabIndex: -1
        },
        showChrome && !fullscreen ? (
          <div
            aria-hidden="true"
            className="sheet-grabber"
            key="grabber"
            onPointerDown={(event) => { dragStartY.current = event.clientY; }}
            onPointerUp={(event) => {
              if (dragStartY.current !== null && event.clientY - dragStartY.current > 60) onClose?.();
              dragStartY.current = null;
            }}
          />
        ) : null,
        showClose ? <button className="modal-close" key="close" type="button" aria-label={closeLabel} onClick={onClose}><X size={18} /></button> : null,
        !bare && title ? <div className="modal-header" key="header"><h2 id={titleId}>{title}</h2></div> : null,
        children
      )}
    </div>
  );
}
