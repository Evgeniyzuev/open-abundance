"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Shared modal: bottom sheet on phones, centred card on wide screens.
 * Handles Escape, backdrop tap, swipe-down on the grabber, focus move/return and scroll lock.
 */
export default function Sheet({
  children,
  className = "",
  closeLabel,
  dismissible = true,
  title,
  titleId,
  onClose
}: {
  children: ReactNode;
  className?: string;
  closeLabel: string;
  dismissible?: boolean;
  title?: ReactNode;
  titleId: string;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const dragStartY = useRef<number | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();

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

  return (
    <div className="modal-backdrop" role="presentation" onClick={dismissible ? onClose : undefined}>
      <section
        aria-labelledby={title ? titleId : undefined}
        aria-modal="true"
        className={`modal-sheet ${className}`.trim()}
        ref={sheetRef}
        role="dialog"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {dismissible ? (
          <div
            aria-hidden="true"
            className="sheet-grabber"
            onPointerDown={(event) => { dragStartY.current = event.clientY; }}
            onPointerUp={(event) => {
              if (dragStartY.current !== null && event.clientY - dragStartY.current > 60) onClose();
              dragStartY.current = null;
            }}
          />
        ) : null}
        {dismissible ? <button className="modal-close" type="button" aria-label={closeLabel} onClick={onClose}><X size={18} /></button> : null}
        {title ? <div className="modal-header"><h2 id={titleId}>{title}</h2></div> : null}
        {children}
      </section>
    </div>
  );
}
