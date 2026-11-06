"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { OrbitLogo } from "./OrbitLogo";

/**
 * On phones the sidebar becomes a slide-in drawer behind a top bar.
 * On tablets and up (md) the sidebar is always visible and this does nothing.
 */
export function MobileShell({ sidebar, children, title, icon }: { sidebar: React.ReactNode; children: React.ReactNode; title: string; icon: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]); // close after navigating
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Drawer / sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 w-[82vw] max-w-72 transform transition-transform duration-200 md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 ${open ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        {sidebar}
      </div>
      {open && <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/60 md:hidden" />}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-side px-3 md:hidden">
          <button onClick={() => setOpen((o) => !o)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft active:bg-hover" aria-label="Menu">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <span className="text-lg">{icon}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
          <OrbitLogo size={20} className="text-accent" />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
