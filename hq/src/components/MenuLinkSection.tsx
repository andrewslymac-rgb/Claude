"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, FileText, GripVertical, Star } from "lucide-react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderLinksAction } from "@/app/tool-actions";
import { useToast } from "@/components/ui/Toast";

type Item = { id: string; label: string; url: string; starred?: boolean };
type Kind = "tools" | "reports" | "links" | "docs" | "customer_docs";
type Group = { label?: string; doc?: boolean; kind: Kind; items: Item[] };

function Row({ t, doc, draggable }: { t: Item; doc?: boolean; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !draggable });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group/row relative flex items-center ${isDragging ? "z-10 rounded-lg bg-card shadow-xl" : ""}`}>
      <a href={t.url} target="_blank" rel="noopener noreferrer" className="nav-item min-w-0 flex-1">
        <span className={t.starred ? "text-amber-400" : "text-ink-faint"}>{t.starred ? <Star size={16} className="fill-current" /> : doc ? <FileText size={16} /> : <ExternalLink size={16} />}</span>
        <span className="min-w-0 flex-1 truncate">{t.label}</span>
      </a>
      {draggable && (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="absolute right-1 flex h-7 w-6 cursor-grab touch-none items-center justify-center rounded text-ink-faint opacity-60 hover:bg-hover hover:text-ink hover:opacity-100 active:cursor-grabbing md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100"
          aria-label={`Drag ${t.label} to reorder`}
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * A fold-out menu section (Tools, Reports, Quick Links). Closed, it shows only the links you
 * starred; open, it shows everything. The section name opens its full page with descriptions.
 * Owners and admins can drag links into a new order right here. Open or closed is remembered on this device.
 */
export function MenuLinkSection({ id, slug, title, icon, href, active, groups: initial, footer, canManage }: { id: string; slug: string; title: string; icon: React.ReactNode; href: string; active: boolean; groups: Group[]; footer?: { label: string; href: string }; canManage?: boolean }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState(initial);
  useEffect(() => setGroups(initial), [initial]);
  const [, start] = useTransition();
  const toast = useToast();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
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

  // A drop reorders within one list, and within its starred or non-starred part (stars are per person, the order is shared).
  const onDragEnd = (gi: number) => (e: DragEndEvent) => {
    const g = groups[gi];
    const from = g.items.findIndex((x) => x.id === e.active.id);
    const to = e.over ? g.items.findIndex((x) => x.id === e.over!.id) : -1;
    if (from < 0 || to < 0 || from === to || Boolean(g.items[from].starred) !== Boolean(g.items[to].starred)) return;
    const items = arrayMove(g.items, from, to);
    setGroups(groups.map((x, i) => (i === gi ? { ...x, items } : x)));
    const ids = items.filter((x) => Boolean(x.starred) === Boolean(g.items[from].starred)).map((x) => x.id);
    start(async () => {
      const r = await reorderLinksAction(slug, g.kind, ids);
      if (!r.ok) {
        toast(r.error ?? "Couldn't save the new order.", false);
        setGroups(initial);
      }
    });
  };

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
          {shown.map((g) => {
            const gi = groups.findIndex((x) => x.kind === g.kind);
            return (
              <div key={g.kind} className="space-y-0.5">
                {open && g.label && <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-medium text-ink-faint">{g.label}</div>}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(gi)}>
                  <SortableContext items={g.items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {g.items.map((t) => (
                      <Row key={t.id} t={t} doc={g.doc} draggable={Boolean(canManage && open)} />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
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
