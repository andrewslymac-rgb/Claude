"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2, Maximize2, Minimize2, X } from "lucide-react";
import { addWidgetAction, removeWidgetAction, reorderWidgetsAction, updateWidgetAction } from "@/app/actions";
import type { LinkItem, WidgetConfig, WidgetType } from "@/db/schema";

type Item = { id: string; title: string; icon: string | null; updatedAt?: string; updatedBy?: string | null; source?: string; state?: string; nextDueOn?: string | null; review?: string };
export type WidgetData = { id: string; type: WidgetType; title: string; width: number; config: WidgetConfig; items: Item[] };
type Catalog = Record<WidgetType, { title: string; description: string; emoji: string; available: boolean }>;
type PageOpt = { id: string; title: string; icon: string | null };

export function Dashboard({ slug, widgets: initial, canCustomize, catalog, allPages }: { slug: string; widgets: WidgetData[]; canCustomize: boolean; catalog: Catalog; allPages: PageOpt[] }) {
  const [widgets, setWidgets] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState<WidgetData | null>(null);
  const [, start] = useTransition();
  useEffect(() => setWidgets(initial), [initial]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = widgets.findIndex((w) => w.id === e.active.id);
    const to = widgets.findIndex((w) => w.id === e.over!.id);
    const next = arrayMove(widgets, from, to);
    setWidgets(next);
    start(() => reorderWidgetsAction(slug, next.map((w) => w.id)));
  };

  return (
    <div className="mt-8">
      {canCustomize && (
        <div className="mb-3 flex justify-end gap-2">
          {editing && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-hover">
              <Plus size={14} /> Add widget
            </button>
          )}
          <button onClick={() => setEditing((e) => !e)} className={`rounded-lg px-3 py-1.5 text-sm ${editing ? "bg-accent text-paper" : "border border-line text-ink-soft hover:bg-hover"}`}>
            {editing ? "Done" : "Customize"}
          </button>
        </div>
      )}
      {editing && <p className="mb-3 text-sm text-ink-soft">Drag tiles by the ⋮⋮ handle to rearrange. Changes save automatically.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {widgets.map((w) => (
              <Tile
                key={w.id}
                w={w}
                slug={slug}
                editing={editing}
                onConfigure={() => setConfiguring(w)}
                onResize={() => {
                  const width = w.width === 2 ? 1 : 2;
                  setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, width } : x)));
                  start(() => updateWidgetAction(slug, w.id, { width }));
                }}
                onRemove={() => {
                  if (!confirm(`Remove "${w.title}" from the dashboard?`)) return;
                  setWidgets((ws) => ws.filter((x) => x.id !== w.id));
                  start(() => removeWidgetAction(slug, w.id));
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {widgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          The dashboard is empty.{canCustomize && " Click Customize → Add widget to get started."}
        </div>
      )}

      {adding && (
        <Modal title="Add a widget" onClose={() => setAdding(false)}>
          <div className="grid gap-2">
            {(Object.keys(catalog) as WidgetType[]).map((t) => (
              <button
                key={t}
                disabled={!catalog[t].available}
                onClick={() => {
                  setAdding(false);
                  start(() => addWidgetAction(slug, t));
                }}
                className="flex items-start gap-3 rounded-lg border border-line p-3 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-2xl">{catalog[t].emoji}</span>
                <span>
                  <span className="block font-medium">{catalog[t].title}</span>
                  <span className="block text-sm text-ink-soft">{catalog[t].description}</span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {configuring && (
        <WidgetSettings
          w={configuring}
          allPages={allPages}
          onClose={() => setConfiguring(null)}
          onSave={(patch) => {
            setWidgets((ws) => ws.map((x) => (x.id === configuring.id ? { ...x, ...patch, config: { ...x.config, ...patch.config } } : x)));
            setConfiguring(null);
            start(() => updateWidgetAction(slug, configuring.id, patch));
          }}
        />
      )}
    </div>
  );
}

function Tile({ w, slug, editing, onConfigure, onResize, onRemove }: { w: WidgetData; slug: string; editing: boolean; onConfigure: () => void; onResize: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const configurable = w.type === "links" || w.type === "pages" || w.type === "welcome";
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-card p-5 ${w.width === 2 ? "md:col-span-2" : ""} ${isDragging ? "z-10 shadow-xl" : ""} ${editing ? "border-dashed border-ink-faint" : "border-line"}`}
    >
      <header className="mb-3 flex items-center gap-2">
        {editing && (
          <button {...attributes} {...listeners} className="cursor-grab rounded p-0.5 text-ink-faint hover:bg-hover active:cursor-grabbing" aria-label="Drag to move">
            <GripVertical size={16} />
          </button>
        )}
        <h2 className="flex-1 text-sm font-semibold text-ink-soft">{w.title}</h2>
        {editing && (
          <div className="flex gap-1 text-ink-faint">
            {configurable && (
              <button onClick={onConfigure} className="rounded p-1 hover:bg-hover hover:text-ink" title="Edit">
                <Pencil size={14} />
              </button>
            )}
            <button onClick={onResize} className="hidden rounded p-1 hover:bg-hover hover:text-ink md:block" title={w.width === 2 ? "Make narrow" : "Make wide"}>
              {w.width === 2 ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={onRemove} className="rounded p-1 hover:bg-danger-soft hover:text-danger" title="Remove">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </header>
      <WidgetBody w={w} slug={slug} />
    </section>
  );
}

const ago = (iso?: string) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function WidgetBody({ w, slug }: { w: WidgetData; slug: string }) {
  if (w.type === "welcome") return <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{w.config.text}</p>;

  if (w.type === "links") {
    const links = w.config.links ?? [];
    if (!links.length) return <Empty>No links yet. Click Customize → ✏️ to add some.</Empty>;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {links.map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm font-medium hover:border-ink-faint hover:bg-side">
            <span className="text-lg">{l.emoji ?? "🔗"}</span>
            <span className="truncate">{l.label}</span>
          </a>
        ))}
      </div>
    );
  }

  if (w.type === "tasks") {
    if (!w.items.length) return <Empty>Nothing overdue or due this week. 🎉</Empty>;
    const tone: Record<string, string> = { overdue: "bg-danger-soft text-danger", today: "bg-warn-soft text-warn", soon: "bg-accent-soft text-accent" };
    const label: Record<string, string> = { overdue: "Overdue", today: "Today", soon: "This week" };
    return (
      <ul className="-mx-2">
        {w.items.map((t) => (
          <li key={t.id}>
            <Link href={`/w/${slug}/tasks`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
              <span className="flex-1 truncate">{t.title}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${tone[t.state ?? ""] ?? ""}`}>{label[t.state ?? ""] ?? ""}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href={`/w/${slug}/tasks`} className="block px-2 pt-2 text-xs text-accent hover:underline">
            All tasks →
          </Link>
        </li>
      </ul>
    );
  }

  if (w.type === "reviews") {
    if (!w.items.length) return <Empty>All document reviews are current.</Empty>;
    const label: Record<string, string> = { overdue: "Overdue", due_soon: "Due soon", first: "First review" };
    const tone: Record<string, string> = { overdue: "bg-danger-soft text-danger", due_soon: "bg-accent-soft text-accent", first: "bg-warn-soft text-warn" };
    return (
      <ul className="-mx-2">
        {w.items.map((d) => (
          <li key={d.id}>
            <Link href={`/w/${slug}/p/${d.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
              <span>{d.icon ?? "📄"}</span>
              <span className="flex-1 truncate">{d.title || "Untitled"}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${tone[d.review ?? ""] ?? ""}`}>{label[d.review ?? ""] ?? ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  if (!w.items.length) {
    const msg = w.type === "sops" ? 'No SOPs yet. Open a page, click •••, then "Mark as SOP".' : w.type === "pages" ? "No pinned pages. Click Customize → ✏️ to pick some." : "Nothing yet.";
    return <Empty>{msg}</Empty>;
  }
  return (
    <ul className="-mx-2">
      {w.items.map((p) => (
        <li key={p.id}>
          <Link href={`/w/${slug}/p/${p.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
            <span>{p.icon ?? "📄"}</span>
            <span className="flex-1 truncate">{p.title || "Untitled"}</span>
            {w.type === "recent" && <span className="shrink-0 text-xs text-ink-faint">{ago(p.updatedAt)}</span>}
            {p.source === "gdrive" && <span className="shrink-0 text-[10px] text-ink-faint">Drive</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-ink-faint">{children}</p>;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-card p-4 shadow-2xl md:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-hover" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function WidgetSettings({ w, allPages, onClose, onSave }: { w: WidgetData; allPages: PageOpt[]; onClose: () => void; onSave: (p: { title: string; config: WidgetConfig }) => void }) {
  const [title, setTitle] = useState(w.title);
  const [text, setText] = useState(w.config.text ?? "");
  const [links, setLinks] = useState<LinkItem[]>(w.config.links ?? []);
  const [pageIds, setPageIds] = useState<string[]>(w.config.pageIds ?? []);
  const [error, setError] = useState("");

  const save = () => {
    const clean = links.filter((l) => l.label.trim() || l.url.trim()).map((l) => ({ ...l, url: /^https?:\/\//.test(l.url) ? l.url : `https://${l.url}` }));
    if (clean.some((l) => !l.label.trim())) return setError("Every link needs a name.");
    onSave({ title: title.trim() || w.title, config: w.type === "welcome" ? { text } : w.type === "links" ? { links: clean } : { pageIds } });
  };

  return (
    <Modal title="Edit widget" onClose={onClose}>
      <label className="block text-sm font-medium">Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="mb-4 mt-1 w-full rounded-lg border border-line px-3 py-2" />

      {w.type === "welcome" && (
        <>
          <label className="block text-sm font-medium">Message</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
        </>
      )}

      {w.type === "links" && (
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input value={l.emoji ?? ""} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))} placeholder="🔗" className="w-12 rounded-lg border border-line px-2 py-2 text-center" />
              <input value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Name" className="w-32 rounded-lg border border-line px-3 py-2" />
              <input value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2" />
              <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="rounded p-2 text-ink-faint hover:bg-danger-soft hover:text-danger" aria-label="Remove link">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setLinks([...links, { label: "", url: "", emoji: "🔗" }])} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-hover">
            <Plus size={14} /> Add link
          </button>
        </div>
      )}

      {w.type === "pages" && (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {allPages.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
              <input type="checkbox" checked={pageIds.includes(p.id)} onChange={(e) => setPageIds(e.target.checked ? [...pageIds, p.id] : pageIds.filter((x) => x !== p.id))} />
              {p.icon ?? "📄"} {p.title}
            </label>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">
          Cancel
        </button>
        <button onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper">
          Save
        </button>
      </div>
    </Modal>
  );
}
