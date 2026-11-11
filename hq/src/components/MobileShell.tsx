"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, X, Home, CheckSquare, AlertTriangle, Library, ChevronLeft, Users } from "lucide-react";
import { OrbitLogo } from "./OrbitLogo";

/**
 * On phones the sidebar becomes a slide-in drawer behind a top bar.
 * On tablets and up (md) the sidebar is always visible and this does nothing.
 */
export function MobileShell({ sidebar, children, title, icon, slug, overdue = 0, attention = 0 }: { sidebar: React.ReactNode; children: React.ReactNode; title: string; icon: string; slug: string; overdue?: number; attention?: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // Home-screen apps have no browser chrome, so Orbit keeps its own back button.
  // We count in-app navigations in this tab so Back only shows when there is somewhere to go.
  const [depth, setDepth] = useState(0);
  useEffect(() => {
    setOpen(false); // close the drawer after navigating
    try {
      const key = "orbit_nav_depth";
      const last = sessionStorage.getItem("orbit_nav_last");
      let d = Number(sessionStorage.getItem(key) ?? "0");
      if (last && last !== pathname) d += 1;
      sessionStorage.setItem(key, String(d));
      sessionStorage.setItem("orbit_nav_last", pathname);
      setDepth(d);
    } catch {
      setDepth(1);
    }
  }, [pathname]);
  const goBack = () => {
    try {
      const d = Math.max(0, Number(sessionStorage.getItem("orbit_nav_depth") ?? "0") - 2); // the pop itself re-counts +1
      sessionStorage.setItem("orbit_nav_depth", String(d));
    } catch {}
    if (window.history.length > 1) router.back();
    else router.push(`/w/${slug}`);
  };
  const isHome = pathname === `/w/${slug}`;
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
        <header className="pt-safe flex shrink-0 items-center gap-2 border-b border-line bg-side/90 px-3 backdrop-blur md:hidden">
          {!isHome && depth > 0 ? (
            <button onClick={goBack} className="my-1 -ml-1 flex h-10 min-w-10 items-center justify-center gap-0.5 rounded-lg pr-2 text-accent active:bg-hover" aria-label="Back">
              <ChevronLeft size={24} /> <span className="text-sm">Back</span>
            </button>
          ) : (
            <button onClick={() => setOpen((o) => !o)} className="my-1 flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft active:bg-hover" aria-label="Menu">
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          )}
          <span className="text-lg">{icon}</span>
          <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-tight">{title}</span>
          <OrbitLogo size={20} className="text-accent" />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto pb-20 scrollbar-thin md:pb-0">{children}</main>

        {/* Mobile bottom tab bar: the things you reach for with a thumb. */}
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-side/95 backdrop-blur md:hidden">
          <Tab href={`/w/${slug}`} icon={<Home size={20} />} label="Home" active={pathname === `/w/${slug}`} />
          <Tab href={`/w/${slug}/tasks`} icon={<CheckSquare size={20} />} label="Tracker" active={pathname.startsWith(`/w/${slug}/tasks`)} badge={attention} />
          <button onClick={() => window.dispatchEvent(new Event("orbit:open-overdue"))} className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] ${overdue ? "text-danger" : "text-ink-soft"}`}>
            <AlertTriangle size={20} />
            Past due
            {overdue > 0 && <span className="absolute right-3 top-1 rounded-full bg-danger px-1.5 text-[10px] font-semibold text-paper">{overdue}</span>}
          </button>
          <Tab href={`/w/${slug}/library`} icon={<Library size={20} />} label="Docs" active={pathname.startsWith(`/w/${slug}/library`) || pathname.startsWith(`/w/${slug}/docs`)} />
          <button onClick={() => setOpen((o) => !o)} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${open ? "text-ink" : "text-ink-soft"}`}>
            <Menu size={20} />
            Menu
          </button>
        </nav>
      </div>
    </div>
  );
}

function Tab({ href, icon, label, active, badge }: { href: string; icon: React.ReactNode; label: string; active: boolean; badge?: number }) {
  return (
    <Link href={href} className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-accent" : "text-ink-soft"}`}>
      {icon}
      {label}
      {badge ? <span className="absolute right-3 top-1 rounded-full bg-danger px-1.5 text-[10px] font-semibold text-paper">{badge}</span> : null}
    </Link>
  );
}
