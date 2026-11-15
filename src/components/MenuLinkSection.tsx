"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, FileText, Star } from "lucide-react";

type Item = { id: string; label: string; url: string; starred?: boolean };
type Group = { label?: string; doc?: boolean; items: Item[] };

/**
 * A fold-out menu section (Tools, Reports, Quick Links). Closed, it shows only the links you
 * starred; open, it shows everything. The section name opens its full page with descriptions.
 * Open or closed is remembered on this device.
 */
export function MenuLinkSection({ id, title, icon, href, active, groups, footer }: { id: string; title: string; icon: React.ReactNode; href: string; active: boolean; groups: Group[]; footer?: { label: string; href: string } }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(`orbit_menu_open:${id}`) === "1");
    } catch {}
  }, [id]);
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(`orbit_menu_open:${id}`, o ? "0" : "1");
      } catch {}
      return !o;
    });
  const shown = groups.map((g) => ({ ...g, items: open ? g.items : g.items.filter((i) => i.starred) })).filter((g) => g.items.length);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="px-2 pb-1 pt-2">
      <div className="flex items-center">
        <button onClick={toggle} className="tap-icon flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-hover hover:text-ink" aria-expanded={open} aria-label={open ? `Fold ${title}` : `Show all ${title}`}>
          <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <Link href={href} data-active={active ? "true" : "false"} className="eyebrow flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1.5 hover:bg-hover hover:text-ink data-[active=true]:text-accent">
          {icon} <span className="truncate">{title}</span>
          {!open && total > 0 && <span className="num ml-auto pr-1 text-[10px] font-medium normal-case tracking-normal text-ink-faint">{total}</span>}
        </Link>
      </div>
      {shown.length > 0 && (
        <nav className="mt-0.5 space-y-0.5">
          {shown.map((g, gi) => (
            <div key={g.label ?? gi} className="space-y-0.5">
              {open && g.label && <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-medium text-ink-faint">{g.label}</div>}
              {g.items.map((t) => (
                <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer" className="nav-item">
                  <span className={t.starred ? "text-amber-400" : "text-ink-faint"}>{t.starred ? <Star size={16} className="fill-current" /> : g.doc ? <FileText size={16} /> : <ExternalLink size={16} />}</span>
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
      )}
      {open && footer && (
        <Link href={footer.href} className="nav-item mt-0.5 text-sm text-ink-soft">
          <span className="w-4" /> {footer.label}
        </Link>
      )}
    </div>
  );
}
