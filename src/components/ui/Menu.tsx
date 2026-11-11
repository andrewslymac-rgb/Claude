"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** True below the md breakpoint (phones). Starts false so the server and first paint agree. */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const set = () => setPhone(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return phone;
}

/**
 * A small action menu. On desktop it's a popover anchored to its trigger (wrap the
 * trigger and this in a `relative` element). On phones it becomes a bottom sheet, so
 * it can never fall off the screen or get clipped by a scrolling list.
 */
export function PopMenu({ open, onClose, title, align = "right", width = "w-52", children }: { open: boolean; onClose: () => void; title?: string; align?: "left" | "right"; width?: string; children: React.ReactNode }) {
  const phone = useIsPhone();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  if (!phone) {
    return (
      <div className={`popover anim-rise absolute top-full z-40 mt-1 ${align === "right" ? "right-0" : "left-0"} ${width} text-sm`} role="menu" onMouseLeave={onClose}>
        {children}
      </div>
    );
  }
  return createPortal(
    <div className="anim-fade fixed inset-0 z-[60] flex items-end bg-black/60" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="anim-rise pb-safe w-full rounded-t-2xl border-t border-line bg-card p-2 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="menu">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
        {title && (
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-hover" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="[&_button]:min-h-12 [&_button]:text-[15px] [&_a]:min-h-12 [&_a]:text-[15px]">{children}</div>
      </div>
    </div>,
    document.querySelector("[data-ws-theme]") ?? document.body,
  );
}

export function MenuItem({ icon, danger, onClick, children, disabled }: { icon?: React.ReactNode; danger?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} role="menuitem" className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left disabled:opacity-50 ${danger ? "text-danger hover:bg-danger-soft" : "hover:bg-hover"}`}>
      {icon && <span className={danger ? "" : "text-ink-faint"}>{icon}</span>} {children}
    </button>
  );
}
