"use client";

import { X } from "lucide-react";
import { createElement, useEffect, useRef, type CSSProperties, type FormEventHandler, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";

// Open sheets, topmost last: Escape closes only the topmost one.
const openSheets: symbol[] = [];
// Marker on the history entry a full-screen sheet adds, so the system Back gesture closes the sheet, not the screen.
const SHEET_HISTORY_KEY = "openAbundanceSheet";
const EDGE_SWIPE_START = 28;
const EDGE_SWIPE_DISTANCE = 80;

/**
 * Shared modal: bottom sheet on phones, centred card on wide screens.
 * Handles Escape, backdrop tap, swipe-down on the grabber, focus move/return and scroll lock.
 * `fullscreen` makes it a full-screen page (same as the post detail view), good for long content. A full-screen sheet
 * also closes with the system Back (Android button, browser back, iOS edge swipe in Safari) and with a swipe from the
 * left edge, which an installed iOS app has no system gesture for; the close cross stays in the top right.
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
  const edgeStart = useRef<{ x: number; y: number } | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!fullscreen || !canDismiss) return;
    const token = `${Date.now()}-${Math.random()}`;
    window.history.pushState({ ...(window.history.state ?? {}), [SHEET_HISTORY_KEY]: token }, "", window.location.href);
    function onPopState() {
      if ((window.history.state as Record<string, unknown> | null)?.[SHEET_HISTORY_KEY] !== token) onCloseRef.current?.();
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Closed by the cross, Escape or the app itself: drop the entry this sheet added, so Back is not wasted later.
      // Checked a tick later, so a sheet that remounts at once (React strict mode) keeps its new entry.
      window.setTimeout(() => {
        if ((window.history.state as Record<string, unknown> | null)?.[SHEET_HISTORY_KEY] === token) window.history.back();
      }, 0);
    };
  }, [canDismiss, fullscreen]);

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
          ...(fullscreen && canDismiss ? {
            onTouchStart: (event: ReactTouchEvent) => {
              const touch = event.touches[0];
              const fromLeft = document.dir === "rtl" ? window.innerWidth - touch.clientX : touch.clientX;
              edgeStart.current = fromLeft <= EDGE_SWIPE_START ? { x: touch.clientX, y: touch.clientY } : null;
            },
            onTouchEnd: (event: ReactTouchEvent) => {
              const start = edgeStart.current;
              edgeStart.current = null;
              if (!start) return;
              const touch = event.changedTouches[0];
              const dx = (touch.clientX - start.x) * (document.dir === "rtl" ? -1 : 1);
              if (dx > EDGE_SWIPE_DISTANCE && Math.abs(touch.clientY - start.y) < dx / 2) onCloseRef.current?.();
            }
          } : {}),
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
