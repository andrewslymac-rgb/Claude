"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2, LayoutDashboard, AlertCircle, RotateCcw, Upload, Search, Check, ChevronDown, Settings2, Lock, Minus } from "lucide-react";
import { addWidgetAction, publishDashboardAction, removeWidgetAction, reorderWidgetsAction, resetDashboardAction, setupCommandCenterAction, updateWidgetAction } from "@/app/actions";
import type { FieldTool, LinkItem, WidgetConfig, WidgetType } from "@/db/schema";
import type { CatalogEntry, WidgetCategory } from "@/lib/services/dashboard";
import { CATEGORY_LABELS } from "@/lib/services/dashboard-meta";
import { JobberTile } from "./JobberTile";
import { CalendarWidget } from "./CalendarWidget";
import { NotesWidget } from "./NotesWidget";
import { Tracker } from "@/components/tasks/Tracker";
import type { TaskRow } from "@/lib/services/tasks";
import { Modal } from "@/components/ui/Modal";
import { PopMenu, MenuItem } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";

type Item = { id: string; title: string; icon: string | null; subtitle?: string; updatedAt?: string; updatedBy?: string | null; source?: string; state?: string; nextDueOn?: string | null; review?: string; count?: number; kind?: string; pageId?: string };
export type TrackerData = { tasks: TaskRow[]; members: { id: string; name: string }[]; roles: { id: string; name: string; emoji: string; color: string; memberIds: string[] }[]; myRoleIds: string[]; pages: PageOpt[]; categories: readonly string[]; me: string; canEdit: boolean };
export type WidgetData = { id: string; type: WidgetType; title: string; width: number; config: WidgetConfig; items: Item[]; total?: number; connected?: boolean; manual?: boolean; fieldTool?: FieldTool; tracker?: TrackerData; error?: string; hidden?: boolean };
export type Stat = { key: string; label: string; value: number; href: string; tone: "danger" | "warn" | "accent" | "ok" | "muted" };
type Catalog = Record<WidgetType, CatalogEntry>;
type PageOpt = { id: string; title: string; icon: string | null };

const SINGLETON: WidgetType[] = ["stats", "tracker", "jobber", "calendar", "collections", "tasks", "followups", "flags", "reviews", "recent", "sops", "team", "changelog", "feedback", "ai", "tools"];

export function Dashboard({ slug, widgets: initial, stats, personal, canPublish, isAdmin, catalog, allPages, googleCalendar }: { slug: string; widgets: WidgetData[]; stats: Stat[]; personal: boolean; canPublish: boolean; isAdmin: boolean; catalog: Catalog; allPages: PageOpt[]; googleCalendar: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [widgets, setWidgets] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [layoutMenu, setLayoutMenu] = useState(false);
  const [configuring, setConfiguring] = useState<WidgetData | null>(null);
  const [, start] = useTransition();
  useEffect(() => setWidgets(initial), [initial]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, okText?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Something went wrong", false);
      else if (r.message ?? okText) toast(r.message ?? okText!);
    });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = widgets.findIndex((w) => w.id === e.active.id);
    const to = widgets.findIndex((w) => w.id === e.over!.id);
    const next = arrayMove(widgets, from, to);
    setWidgets(next);
    run(() => reorderWidgetsAction(slug, next.map((w) => w.id)));
  };
  const patch = (w: WidgetData, p: { title?: string; width?: number; config?: WidgetConfig }) => {
    setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, ...p, config: { ...x.config, ...(p.config ?? {}) } } : x)));
    run(() => updateWidgetAction(slug, w.id, p));
  };

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-sm">
        {editing && (
          <>
            <span className="mr-auto flex items-center gap-1.5 text-xs text-ink-faint">
              {personal ? <Pencil size={12} /> : <Lock size={12} />} {personal ? "Your layout" : "Company layout (editing makes your own copy)"}
            </span>
            <button onClick={() => setAdding(true)} className="btn btn-secondary btn-sm">
              <Plus size={14} /> Add widget
            </button>
            <div className="relative">
              <button onClick={() => setLayoutMenu((m) => !m)} className="btn btn-secondary btn-sm">
                <LayoutDashboard size={14} /> Layouts <ChevronDown size={12} />
              </button>
              <PopMenu open={layoutMenu} onClose={() => setLayoutMenu(false)} title="Layouts" width="w-64">
                <MenuItem icon={<LayoutDashboard size={14} />} onClick={() => (setLayoutMenu(false), confirm("Replace your dashboard with the command-center layout? Your tool buttons are kept.") && run(() => setupCommandCenterAction(slug), "Command center set up."))}>
                  Command-center layout
                </MenuItem>
                {personal && (
                  <MenuItem icon={<RotateCcw size={14} />} onClick={() => (setLayoutMenu(false), confirm("Go back to the company's default dashboard? Your own arrangement is dropped.") && run(() => resetDashboardAction(slug)))}>
                    Reset to company default
                  </MenuItem>
                )}
                {canPublish && (
                  <MenuItem icon={<Upload size={14} />} onClick={() => (setLayoutMenu(false), confirm("Make your layout the company default? Everyone who hasn't customised their own dashboard will see it.") && run(() => publishDashboardAction(slug)))}>
                    Publish as company default
                  </MenuItem>
                )}
              </PopMenu>
            </div>
          </>
        )}
        <button onClick={() => setEditing((e) => !e)} className={`btn btn-sm ${editing ? "btn-primary" : "btn-secondary"}`}>
          {editing ? (
            <>
              <Check size={14} /> Done
            </>
          ) : (
            <>
              <Settings2 size={14} /> Customize
            </>
          )}
        </button>
      </div>
      {editing && <p className="mb-3 text-xs text-ink-soft">Drag tiles by the ⋮⋮ handle. Set each tile&apos;s width, how many rows it shows, and its settings. Everything saves as you go.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {widgets.map((w, i) => (
              <Tile
                key={w.id}
                w={w}
                index={i}
                slug={slug}
                stats={stats}
                isAdmin={isAdmin}
                googleCalendar={googleCalendar}
                catalog={catalog[w.type]}
                editing={editing}
                onConfigure={() => setConfiguring(w)}
                onWidth={(width) => patch(w, { width })}
                onLimit={(limit) => patch(w, { config: { limit } })}
                onRetry={() => router.refresh()}
                onRemove={() => {
                  if (!confirm(`Remove "${w.title}" from your dashboard?`)) return;
                  setWidgets((ws) => ws.filter((x) => x.id !== w.id));
                  run(() => removeWidgetAction(slug, w.id));
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {widgets.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          <LayoutDashboard size={28} className="mx-auto mb-3 text-ink-faint" />
          Your dashboard is empty.
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => run(() => setupCommandCenterAction(slug), "Command center set up.")} className="btn btn-primary">
              Set up the command center
            </button>
            <button onClick={() => setAdding(true)} className="btn btn-secondary">
              Pick widgets
            </button>
          </div>
        </div>
      )}

      {adding && (
        <WidgetGallery
          catalog={catalog}
          isAdmin={isAdmin}
          present={widgets.map((w) => w.type)}
          onClose={() => setAdding(false)}
          onAdd={(t) => run(() => addWidgetAction(slug, t), `${catalog[t].title} added.`)}
        />
      )}

      {configuring && (
        <WidgetSettings
          w={configuring}
          allPages={allPages}
          onClose={() => setConfiguring(null)}
          onSave={(p) => {
            setConfiguring(null);
            patch(configuring, p);
          }}
        />
      )}
    </div>
  );
}


const SPAN: Record<number, string> = { 1: "", 2: "md:col-span-2", 3: "md:col-span-2 lg:col-span-3" };

function Tile({ w, index, slug, stats, isAdmin, googleCalendar, catalog, editing, onConfigure, onWidth, onLimit, onRetry, onRemove }: { w: WidgetData; index: number; slug: string; stats: Stat[]; isAdmin: boolean; googleCalendar: boolean; catalog: CatalogEntry; editing: boolean; onConfigure: () => void; onWidth: (n: number) => void; onLimit: (n: number) => void; onRetry: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const limit = w.config.limit ?? 6;
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={`card anim-rise flex flex-col p-4 md:p-5 ${SPAN[w.width] ?? ""} ${isDragging ? "z-10 shadow-2xl ring-2 ring-accent/50" : ""} ${editing ? "border-dashed !border-ink-faint/70" : ""}`}
      aria-label={w.title}
    >
      <header className="mb-3 flex items-center gap-2">
        {editing && (
          <button {...attributes} {...listeners} className="cursor-grab rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink active:cursor-grabbing" aria-label="Drag to move">
            <GripVertical size={16} />
          </button>
        )}
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
          <span className="text-base leading-none">{catalog.emoji}</span> <span className="truncate">{w.title}</span>
          {catalog.personal && !editing && <Lock size={11} className="shrink-0 text-ink-faint" aria-label="Only you see this" />}
          {typeof w.total === "number" && w.total > w.items.length && !editing && <span className="num rounded-full bg-hover px-1.5 text-[10px] font-semibold normal-case tracking-normal text-ink-faint">{w.total}</span>}
        </h2>
        {editing && (
          <div className="flex items-center gap-1 text-ink-faint">
            {catalog.listy && (
              <span className="mr-1 flex items-center gap-0.5 rounded-lg border border-line px-1" title="Rows shown">
                <button onClick={() => onLimit(Math.max(3, limit - 3))} className="rounded p-0.5 hover:bg-hover hover:text-ink" aria-label="Fewer rows">
                  <Minus size={12} />
                </button>
                <span className="num w-5 text-center text-[11px]">{limit}</span>
                <button onClick={() => onLimit(Math.min(30, limit + 3))} className="rounded p-0.5 hover:bg-hover hover:text-ink" aria-label="More rows">
                  <Plus size={12} />
                </button>
              </span>
            )}
            <span className="hidden overflow-hidden rounded-lg border border-line md:flex" role="radiogroup" aria-label="Width">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => onWidth(n)} role="radio" aria-checked={w.width === n} className={`px-2 py-0.5 text-[11px] ${w.width === n ? "bg-accent-soft font-semibold text-accent" : "hover:bg-hover hover:text-ink"}`} title={`${n} of 3 columns`}>
                  {n === 1 ? "⅓" : n === 2 ? "⅔" : "full"}
                </button>
              ))}
            </span>
            {catalog.configurable && (
              <button onClick={onConfigure} className="tap-icon rounded-md p-1 hover:bg-hover hover:text-ink" title="Settings">
                <Pencil size={14} />
              </button>
            )}
            <button onClick={onRemove} className="tap-icon rounded-md p-1 hover:bg-danger-soft hover:text-danger" title="Remove">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1">
        {w.error ? (
          <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm text-warn">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">This tile couldn&apos;t load.</div>
              <div className="text-xs opacity-80">{w.error}</div>
            </div>
            <button onClick={onRetry} className="text-xs font-medium underline">
              Retry
            </button>
          </div>
        ) : (
          <WidgetBody w={w} slug={slug} stats={stats} isAdmin={isAdmin} googleCalendar={googleCalendar} />
        )}
      </div>
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
const fmtDay = (iso?: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

const STAT_TONE: Record<Stat["tone"], string> = { danger: "text-danger", warn: "text-warn", accent: "text-accent", ok: "text-ok", muted: "text-ink-faint" };
const STAT_EDGE: Record<Stat["tone"], string> = { danger: "border-t-danger", warn: "border-t-warn", accent: "border-t-accent", ok: "border-t-ok", muted: "border-t-ink-faint" };

function WidgetBody({ w, slug, stats, isAdmin, googleCalendar }: { w: WidgetData; slug: string; stats: Stat[]; isAdmin: boolean; googleCalendar: boolean }) {
  switch (w.type) {
    case "welcome":
      return w.config.text?.trim() ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{w.config.text}</p> : <Empty>Nothing written yet. Customize → ✏️ to add a note for the team.</Empty>;

    case "stats":
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) =>
            s.key === "overdue" ? (
              <button key={s.key} onClick={() => window.dispatchEvent(new Event("orbit:open-overdue"))} className={`stat-tile ${STAT_EDGE[s.tone]}`}>
                <div className="eyebrow">{s.label}</div>
                <div className={`num mt-1 text-[28px] font-semibold leading-none ${STAT_TONE[s.tone]}`}>{s.value}</div>
              </button>
            ) : (
              <Link key={s.key} href={s.href} className={`stat-tile ${STAT_EDGE[s.tone]}`}>
                <div className="eyebrow">{s.label}</div>
                <div className={`num mt-1 text-[28px] font-semibold leading-none ${STAT_TONE[s.tone]}`}>{s.value}</div>
              </Link>
            ),
          )}
        </div>
      );

    case "tools": {
      const links = w.config.links ?? [];
      if (!links.length) return <Empty>No tools yet. Customize → ✏️ to add Jobber, QuickBooks, Slack…</Empty>;
      return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {links.map((l, i) => (
            <AppLink key={i} link={l} className="group flex flex-col items-center gap-1.5 rounded-xl border border-line bg-side px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-ink-faint hover:bg-hover">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl" style={{ background: `${l.color ?? "#6366f1"}33`, boxShadow: `inset 0 0 0 1px ${l.color ?? "#6366f1"}66` }}>
                {l.emoji ?? "🔗"}
              </span>
              <span className="w-full truncate text-xs font-medium">{l.label}</span>
            </AppLink>
          ))}
        </div>
      );
    }

    case "links": {
      const links = w.config.links ?? [];
      if (!links.length) return <Empty>No links yet. Customize → ✏️ to add some.</Empty>;
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {links.map((l, i) => (
            <AppLink key={i} link={l} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm font-medium hover:border-ink-faint hover:bg-side">
              <span className="text-lg">{l.emoji ?? "🔗"}</span>
              <span className="truncate">{l.label}</span>
            </AppLink>
          ))}
        </div>
      );
    }

    case "tracker":
      return w.tracker ? <Tracker mode="dashboard" slug={slug} tasks={w.tracker.tasks} members={w.tracker.members} roles={w.tracker.roles} myRoleIds={w.tracker.myRoleIds} pages={w.tracker.pages} categories={w.tracker.categories} me={w.tracker.me} canEdit={w.tracker.canEdit} /> : null;

    case "jobber":
      return <JobberTile slug={slug} fieldTool={w.fieldTool ?? "none"} connected={Boolean(w.connected)} manual={w.manual} canManage={isAdmin} />;

    case "calendar":
      return <CalendarWidget slug={slug} days={w.config.days ?? 7} connected={Boolean(w.connected)} googleEnabled={googleCalendar} />;

    case "notes":
      return <NotesWidget slug={slug} widgetId={w.id} initial={w.config.text ?? ""} />;

    case "collections":
      if (!w.items.length) return <Empty cta={{ href: `/w/${slug}/settings?tab=sync`, label: "Connect a Drive folder" }}>No document areas yet.</Empty>;
      return (
        <div className="grid grid-cols-2 gap-2">
          {w.items.map((c) => (
            <Link key={c.id} href={`/w/${slug}/docs/${c.id}`} className="flex items-center gap-2 rounded-lg border border-line bg-side px-3 py-2.5 hover:border-ink-faint hover:bg-hover">
              <span className="text-xl">{c.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.title}</span>
                <span className="block text-xs text-ink-faint">{c.count} documents</span>
              </span>
            </Link>
          ))}
          <More href={`/w/${slug}/library`} className="col-span-2">Document Library</More>
        </div>
      );

    case "flags": {
      if (!w.items.length) return <Empty>No open flags. 🎉</Empty>;
      const tone: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warn-soft text-warn", low: "bg-hover text-ink-soft" };
      return (
        <List>
          {w.items.map((f) => (
            <Row key={f.id} href={`/w/${slug}/flags`} title={f.title} badge={<Badge cls={tone[f.state ?? ""] ?? ""}>{f.state}</Badge>} />
          ))}
          <More href={`/w/${slug}/flags`}>All flags</More>
        </List>
      );
    }

    case "tasks": {
      if (!w.items.length) return <Empty>Nothing overdue or due this week. 🎉</Empty>;
      const tone: Record<string, string> = { overdue: "bg-danger-soft text-danger", today: "bg-warn-soft text-warn", soon: "bg-accent-soft text-accent" };
      const label: Record<string, string> = { overdue: "Overdue", today: "Today", soon: "This week" };
      return (
        <List>
          {w.items.map((t) => (
            <Row key={t.id} href={`/w/${slug}/tasks`} title={t.title} sub={t.nextDueOn ? fmtDay(t.nextDueOn) : undefined} badge={<Badge cls={tone[t.state ?? ""] ?? ""}>{label[t.state ?? ""] ?? ""}</Badge>} />
          ))}
          <More href={`/w/${slug}/tasks`}>All tasks</More>
        </List>
      );
    }

    case "followups": {
      if (!w.items.length) return <Empty>No follow-ups due. Set one from any task&apos;s drawer.</Empty>;
      return (
        <List>
          {w.items.map((t) => (
            <Row key={t.id} href={`/w/${slug}/tasks`} title={t.title} sub={t.subtitle ?? fmtDay(t.nextDueOn)} badge={<Badge cls={t.state === "overdue" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}>{t.state === "overdue" ? `was ${fmtDay(t.nextDueOn)}` : "Today"}</Badge>} />
          ))}
          <More href={`/w/${slug}/tasks`}>All tasks</More>
        </List>
      );
    }

    case "reviews": {
      if (!w.items.length) return <Empty>All document reviews are current.</Empty>;
      const label: Record<string, string> = { overdue: "Overdue", due_soon: "Due soon", first: "First review" };
      const tone: Record<string, string> = { overdue: "bg-danger-soft text-danger", due_soon: "bg-accent-soft text-accent", first: "bg-warn-soft text-warn" };
      return (
        <List>
          {w.items.map((d) => (
            <Row key={d.id} href={`/w/${slug}/p/${d.id}`} icon={d.icon ?? "📄"} title={d.title || "Untitled"} badge={<Badge cls={tone[d.review ?? ""] ?? ""}>{label[d.review ?? ""] ?? ""}</Badge>} />
          ))}
          <More href={`/w/${slug}/library`}>Document Library</More>
        </List>
      );
    }

    case "changelog":
      if (!w.items.length) return <Empty>No changes logged yet. Open an SOP and use &ldquo;Log a change&rdquo;.</Empty>;
      return (
        <List>
          {w.items.map((l) => (
            <Row key={l.id} href={`/w/${slug}/p/${l.pageId}`} icon={l.icon ?? "📄"} title={l.title} sub={`${l.subtitle} · ${l.updatedBy ?? "Someone"} · ${ago(l.updatedAt)}`} badge={<Badge cls={l.state === "told" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}>{l.state === "told" ? "Team told" : "Not told"}</Badge>} />
          ))}
          <More href={`/w/${slug}/library`}>Full change log</More>
        </List>
      );

    case "team":
      if (!w.items.length) return <Empty cta={{ href: `/w/${slug}/team`, label: "Open Team" }}>Nobody has tasks yet.</Empty>;
      return (
        <List>
          {w.items.map((p) => (
            <Row key={p.id} href={`/w/${slug}/team/${p.id}`} title={p.title} sub={p.subtitle} badge={<Ring pct={p.count ?? 0} />} />
          ))}
          <More href={`/w/${slug}/team`}>Whole team</More>
        </List>
      );

    case "feedback": {
      if (!w.items.length) return <Empty>No new feedback. The inbox is clear.</Empty>;
      const tone: Record<string, string> = { bug: "bg-danger-soft text-danger", idea: "bg-accent-soft text-accent", question: "bg-warn-soft text-warn" };
      return (
        <List>
          {w.items.map((f) => (
            <Row key={f.id} href={`/w/${slug}/feedback`} title={f.title} sub={`${f.subtitle ?? "Someone"} · ${ago(f.updatedAt)}`} badge={<Badge cls={tone[f.state ?? ""] ?? ""}>{f.state}</Badge>} />
          ))}
          <More href={`/w/${slug}/feedback`}>All feedback</More>
        </List>
      );
    }

    case "ai":
      if (!w.items.length) return <Empty>Nothing waiting. Claude&apos;s proposed edits show up here.</Empty>;
      return (
        <List>
          {w.items.map((p) => (
            <Row key={p.id} href={`/w/${slug}/ai`} icon={p.icon ?? "🤖"} title={p.title} sub={p.subtitle} />
          ))}
          <More href={`/w/${slug}/ai`}>Review in AI</More>
        </List>
      );

    default: {
      if (!w.items.length) {
        const msg = w.type === "sops" ? 'No SOPs yet. Open a page, click •••, then "Mark as SOP".' : w.type === "pages" ? "No pinned pages. Customize → ✏️ to pick some." : "Nothing here yet.";
        return <Empty>{msg}</Empty>;
      }
      return (
        <List>
          {w.items.map((p) => (
            <Row key={p.id} href={`/w/${slug}/p/${p.id}`} icon={p.icon ?? "📄"} title={p.title || "Untitled"} badge={w.type === "recent" ? <span className="shrink-0 text-xs text-ink-faint">{ago(p.updatedAt)}</span> : p.source === "gdrive" ? <span className="shrink-0 text-[10px] text-ink-faint">Drive</span> : undefined} />
          ))}
        </List>
      );
    }
  }
}

// ------------------------------------------------------------------ small pieces

const List = ({ children }: { children: React.ReactNode }) => <ul className="-mx-2">{children}</ul>;
const Badge = ({ cls, children }: { cls: string; children: React.ReactNode }) => <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${cls}`}>{children}</span>;
function Row({ href, icon, title, sub, badge }: { href: string; icon?: string; title: string; sub?: string; badge?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          {sub && <span className="block truncate text-[11px] text-ink-faint">{sub}</span>}
        </span>
        {badge}
      </Link>
    </li>
  );
}
const More = ({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) => (
  <li className={className}>
    <Link href={href} className="block px-2 pt-2 text-xs font-medium text-accent hover:underline">
      {children} →
    </Link>
  </li>
);
function Ring({ pct }: { pct: number }) {
  const color = pct >= 85 ? "var(--color-ok)" : pct >= 60 ? "var(--color-warn)" : "var(--color-danger)";
  return (
    <span className="num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
      {pct}%
    </span>
  );
}
const Empty = ({ children, cta }: { children: React.ReactNode; cta?: { href: string; label: string } }) => (
  <div className="rounded-lg bg-side/50 px-3 py-4 text-center text-sm text-ink-faint">
    {children}
    {cta && (
      <div className="mt-2">
        <Link href={cta.href} className="font-medium text-accent hover:underline">
          {cta.label} →
        </Link>
      </div>
    )}
  </div>
);

const isPhone = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const VERIFIED_SCHEMES = ["slack:", "googlegmail:", "googlecalendar:", "googledrive:", "openphone:"];

/** On a phone, try the installed app first and fall back to the web page. On desktop it's a plain link. */
function AppLink({ link, className, children }: { link: LinkItem; className: string; children: React.ReactNode }) {
  const appUrl = link.appUrl?.trim();
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={(e) => {
        if (!appUrl || !isPhone()) return;
        const scheme = appUrl.slice(0, appUrl.indexOf(":") + 1).toLowerCase();
        if (!VERIFIED_SCHEMES.includes(scheme) && !isStandalone()) return;
        e.preventDefault();
        const started = Date.now();
        const fallback = setTimeout(() => {
          if (document.visibilityState === "visible" && Date.now() - started < 2500) window.location.href = link.url;
        }, 1200);
        document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && clearTimeout(fallback), { once: true });
        window.location.href = appUrl;
      }}
    >
      {children}
    </a>
  );
}

// ------------------------------------------------------------------ gallery

function WidgetGallery({ catalog, isAdmin, present, onClose, onAdd }: { catalog: Catalog; isAdmin: boolean; present: WidgetType[]; onClose: () => void; onAdd: (t: WidgetType) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<WidgetCategory | "all">("all");
  const [justAdded, setJustAdded] = useState<WidgetType[]>([]);
  const entries = useMemo(
    () =>
      (Object.entries(catalog) as [WidgetType, CatalogEntry][])
        .filter(([, e]) => !e.adminOnly || isAdmin)
        .filter(([, e]) => cat === "all" || e.category === cat)
        .filter(([t, e]) => !q.trim() || `${t} ${e.title} ${e.description}`.toLowerCase().includes(q.toLowerCase())),
    [catalog, isAdmin, cat, q],
  );
  const cats = Object.keys(CATEGORY_LABELS) as WidgetCategory[];
  return (
    <Modal title="Add a widget" subtitle="Everything here is live data from Orbit. Pick what you want on your dashboard." onClose={onClose} wide>
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search widgets…" className="field pl-9" />
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["all", ...cats] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`tap rounded-full border px-3 py-1 text-xs ${cat === c ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>
            {c === "all" ? "All" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map(([t, e]) => {
          const onBoard = present.includes(t) || justAdded.includes(t);
          const blocked = onBoard && SINGLETON.includes(t);
          return (
            <div key={t} className={`flex items-start gap-3 rounded-xl border p-3 ${blocked ? "border-line opacity-60" : "border-line hover:border-accent/60"}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-side text-2xl">{e.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{e.title}</span>
                  {e.personal && <Lock size={11} className="text-ink-faint" aria-label="Private to you" />}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{e.description}</p>
                <div className="mt-2">
                  {blocked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                      <Check size={12} /> On your dashboard
                    </span>
                  ) : (
                    <button onClick={() => (setJustAdded((j) => [...j, t]), onAdd(t))} className="btn btn-primary btn-sm">
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <p className="col-span-2 py-6 text-center text-sm text-ink-faint">No widgets match.</p>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ per-widget settings

function WidgetSettings({ w, allPages, onClose, onSave }: { w: WidgetData; allPages: PageOpt[]; onClose: () => void; onSave: (p: { title: string; config: WidgetConfig }) => void }) {
  const [title, setTitle] = useState(w.title);
  const [text, setText] = useState(w.config.text ?? "");
  const [links, setLinks] = useState<LinkItem[]>(w.config.links ?? []);
  const [pageIds, setPageIds] = useState<string[]>(w.config.pageIds ?? []);
  const [days, setDays] = useState(w.config.days ?? 7);
  const [error, setError] = useState("");

  const save = () => {
    const clean = links.filter((l) => l.label.trim() || l.url.trim()).map((l) => ({ ...l, url: /^https?:\/\//.test(l.url) ? l.url : `https://${l.url}`, appUrl: l.appUrl?.trim() || undefined }));
    if (clean.some((l) => !l.label.trim())) return setError("Every link needs a name.");
    if (clean.some((l) => { try { new URL(l.url); return false; } catch { return true; } })) return setError("One of the addresses isn't a valid link.");
    const config: WidgetConfig = w.type === "welcome" ? { text } : w.type === "links" || w.type === "tools" ? { links: clean } : w.type === "pages" ? { pageIds } : w.type === "calendar" ? { days } : {};
    onSave({ title: title.trim() || w.title, config });
  };

  return (
    <Modal title={`${w.title} settings`} onClose={onClose}>
      <label className="block text-sm font-medium">Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="mb-4 mt-1 field" />

      {w.type === "welcome" && (
        <>
          <label className="block text-sm font-medium">Message</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-1 field" />
        </>
      )}

      {w.type === "calendar" && (
        <label className="block text-sm font-medium">
          Days ahead
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="field mt-1">
            {[1, 3, 7, 14, 31].map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "Today only" : `${d} days`}
              </option>
            ))}
          </select>
        </label>
      )}

      {w.type === "notes" && <p className="text-sm text-ink-soft">The scratchpad saves as you type. Each person sees only their own text, even on the company layout.</p>}

      {(w.type === "links" || w.type === "tools") && (
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2 rounded-lg border border-line p-2">
              <input value={l.emoji ?? ""} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))} placeholder="🔗" className="w-12 rounded-lg border border-line bg-paper/60 px-2 py-2 text-center" aria-label="Icon" />
              {w.type === "tools" && <input type="color" value={l.color ?? "#6366f1"} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-10 w-10 cursor-pointer rounded-lg border border-line bg-transparent p-1" title="Color" />}
              <input value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Name" className="w-32 rounded-lg border border-line bg-paper/60 px-3 py-2" aria-label="Name" />
              <input value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-line bg-paper/60 px-3 py-2" aria-label="Address" />
              {w.type === "tools" && <input value={l.appUrl ?? ""} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, appUrl: e.target.value } : x)))} placeholder="Phone app link, e.g. slack://open (optional)" className="field text-xs" />}
              <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-faint hover:bg-danger-soft hover:text-danger" aria-label="Remove link">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setLinks([...links, { label: "", url: "", emoji: "🔗" }])} className="btn btn-ghost btn-sm">
            <Plus size={14} /> Add link
          </button>
        </div>
      )}

      {w.type === "pages" && (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
          {allPages.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
              <input type="checkbox" checked={pageIds.includes(p.id)} onChange={(e) => setPageIds(e.target.checked ? [...pageIds, p.id] : pageIds.filter((x) => x !== p.id))} />
              {p.icon ?? "📄"} {p.title}
            </label>
          ))}
          {allPages.length === 0 && <p className="px-2 py-3 text-sm text-ink-faint">No pages yet.</p>}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost">
          Cancel
        </button>
        <button onClick={save} className="btn btn-primary">
          Save
        </button>
      </div>
    </Modal>
  );
}
