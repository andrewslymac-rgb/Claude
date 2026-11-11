"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Home, LogOut, MoreHorizontal, Plus, Search, Settings, Trash2, CheckSquare, BookOpen, Library, Flag, Bot, FolderOpen, AlertTriangle, MessageSquareHeart, Users, UserRound, Briefcase } from "lucide-react";
import { NamePrompt } from "@/components/NamePrompt";
import { createPortal } from "react-dom";
import { NewTaskButton } from "@/components/tasks/NewTaskButton";
import { OverduePanel, type OverdueItem } from "./tasks/OverduePanel";
import { archivePageAction, createPageAction, movePageAction, signOutAction } from "@/app/actions";
import { SearchPalette } from "./SearchPalette";
import { NewWorkspaceDialog } from "./NewWorkspaceForm";
import { OrbitLogo } from "./OrbitLogo";
import { ThemeToggle } from "./ThemeToggle";

type Ws = { slug: string; name: string; icon: string; color: string };
type Node = { id: string; parentId: string | null; title: string; icon: string | null; position: number; isSop: boolean; source: string };
export type CollectionNav = { id: string; label: string; icon: string; count: number; rootPageId: string | null };

export function Sidebar(props: { workspace: Ws; workspaces: Ws[]; tree: Node[]; collections: CollectionNav[]; user: { name: string; email: string; isAppAdmin: boolean; firstName?: string | null; lastName?: string | null }; canEdit: boolean; canManage: boolean; attention?: number; overdue: OverdueItem[]; me: string; openFlags?: number; pendingAi?: number; newFeedback?: number; canManageTasks?: boolean }) {
  const { workspace, canEdit, collections } = props;
  const [overdueOpen, setOverdueOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOverdueOpen(true);
    window.addEventListener("orbit:open-overdue", onOpen);
    return () => window.removeEventListener("orbit:open-overdue", onOpen);
  }, []);
  // Document areas have their own section; keep their synced pages out of the free-form Pages tree.
  const tree = useMemo(() => {
    const roots = new Set(collections.map((c) => c.rootPageId).filter(Boolean) as string[]);
    if (!roots.size) return props.tree;
    const byId = new Map(props.tree.map((n) => [n.id, n]));
    const hidden = (n: Node): boolean => {
      let cur: Node | undefined = n;
      while (cur) {
        if (roots.has(cur.id)) return true;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return false;
    };
    return props.tree.filter((n) => !hidden(n));
  }, [props.tree, collections]);
  const router = useRouter();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => userRef.current && !userRef.current.contains(e.target as Element) && setUserOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const [pending, start] = useTransition();
  const base = `/w/${workspace.slug}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const newPage = (parentId: string | null) =>
    start(async () => {
      const id = await createPageAction(workspace.slug, parentId);
      router.push(`${base}/p/${id}`);
    });

  return (
    <aside className="pt-safe flex h-full w-full flex-col border-r border-line bg-side text-[15px] md:text-[14px]">
      <Link href="/" className="flex items-center gap-2 px-4 pb-1 pt-4 text-accent hover:opacity-80" title="All companies">
        <OrbitLogo size={22} />
        <span className="text-lg font-bold tracking-tight text-ink">orbit</span>
      </Link>
      <WorkspaceSwitcher current={workspace} all={props.workspaces} canCreate={props.user.isAppAdmin} />
      {props.canManageTasks && (
        <div className="px-3 pb-2">
          <NewTaskButton slug={workspace.slug} variant="sidebar" />
        </div>
      )}

      <div className="eyebrow flex items-center gap-1 px-4 pb-1 pt-2">
        <Briefcase size={11} /> Work
      </div>
      <nav className="space-y-0.5 px-2 pb-2">
        <NavItem href={base} icon={<Home size={16} />} label="Home" active={pathname === base} />
        <button onClick={() => setSearchOpen(true)} className="nav-item w-full">
          <span className="text-ink-faint"><Search size={16} /></span> Search
          <kbd className="kbd ml-auto hidden md:inline">⌘K</kbd>
        </button>
        <NavItem href={`${base}/tasks`} icon={<CheckSquare size={16} />} label="Tracker" active={pathname.startsWith(`${base}/tasks`)} badge={props.attention || undefined} />
        <NavItem href={props.canManageTasks ? `${base}/team` : `${base}/team/${props.me}`} icon={<Users size={16} />} label={props.canManageTasks ? "Team" : "My progress"} active={pathname.startsWith(`${base}/team`)} />
        <button onClick={() => setOverdueOpen(true)} className={`nav-item w-full ${props.overdue.length ? "text-danger hover:bg-danger-soft hover:text-danger" : ""}`}>
          <span className={props.overdue.length ? "text-danger" : "text-ink-faint"}><AlertTriangle size={16} /></span> <span className="flex-1 text-left">Past due</span>
          {props.overdue.length > 0 && <span className="num rounded-full bg-danger px-1.5 text-[11px] font-semibold text-paper">{props.overdue.length}</span>}
        </button>
        <NavItem href={`${base}/flags`} icon={<Flag size={16} />} label="Flags" active={pathname.startsWith(`${base}/flags`)} badge={props.openFlags || undefined} />
      </nav>

      <div className="eyebrow flex items-center gap-1 px-4 pb-1 pt-3">
        <FolderOpen size={11} /> Documents
      </div>
      <nav className="space-y-0.5 px-2 pb-1">
        <NavItem href={`${base}/library`} icon={<Library size={16} />} label="Document Library" active={pathname.startsWith(`${base}/library`)} />
      </nav>
      {collections.length > 0 && (
        <nav className="space-y-0.5 px-2">
          {collections.map((c) => (
            <Link key={c.id} href={`${base}/docs/${c.id}`} data-active={pathname.startsWith(`${base}/docs/${c.id}`) ? "true" : "false"} className="nav-item">
              <span className="w-5 shrink-0 text-center">{c.icon}</span>
              <span className="flex-1 truncate">{c.label}</span>
              <span className="num text-[11px] text-ink-faint">{c.count}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="eyebrow flex items-center justify-between px-4 pb-1 pt-4">
        <span className="flex items-center gap-1">
          <BookOpen size={11} /> Pages
        </span>
        <span className="flex items-center gap-1">
          <Link href={`${base}/trash`} className={`rounded p-0.5 hover:bg-hover hover:text-ink ${pathname === `${base}/trash` ? "text-ink" : ""}`} title="Trash">
            <Trash2 size={13} />
          </Link>
          {canEdit && (
            <button onClick={() => newPage(null)} disabled={pending} className="rounded p-0.5 hover:bg-hover hover:text-ink" title="New page">
              <Plus size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="min-h-24 flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        <PageTree slug={workspace.slug} nodes={tree} canEdit={canEdit} onNew={newPage} />
        {canEdit && (
          <button onClick={() => newPage(null)} disabled={pending} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ink-faint hover:bg-hover hover:text-ink">
            <Plus size={16} /> New page
          </button>
        )}
      </div>

      <div className="space-y-0.5 border-t border-line px-2 py-2 pb-20 md:pb-2">
        <NavItem href={`${base}/ai`} icon={<Bot size={16} />} label="AI" active={pathname === `${base}/ai`} badge={props.pendingAi || undefined} />
        <NavItem href={`${base}/settings`} icon={<Settings size={16} />} label="Settings" active={pathname.startsWith(`${base}/settings`)} />
        <NavItem href={`${base}/feedback${pathname.startsWith(`${base}/feedback`) ? "" : `?from=${encodeURIComponent(pathname)}`}`} icon={<MessageSquareHeart size={16} />} label="Feedback & bugs" active={pathname.startsWith(`${base}/feedback`)} badge={props.newFeedback || undefined} />
        <div className="relative mt-1 border-t border-line pt-2" ref={userRef}>
          <button onClick={() => setUserOpen((o) => !o)} className="nav-item w-full" aria-haspopup="menu" aria-expanded={userOpen}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{(props.user.name || "?")[0].toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate text-left">{props.user.name}</span>
            <ChevronDown size={14} className="text-ink-faint" />
          </button>
          {userOpen && (
            <div className="popover anim-rise absolute bottom-full left-0 right-0 z-30 mb-1 text-sm" role="menu">
              <div className="px-2.5 py-2">
                <div className="truncate font-medium">{props.user.name}</div>
                <div className="truncate text-xs text-ink-faint">{props.user.email}</div>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-ink-soft">
                Appearance <ThemeToggle compact />
              </div>
              <button onClick={() => (setUserOpen(false), setNameOpen(true))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-hover" role="menuitem">
                <UserRound size={14} className="text-ink-faint" /> Edit my name
              </button>
              <Link href={`${base}/team/${props.me}`} onClick={() => setUserOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-hover" role="menuitem">
                <CheckSquare size={14} className="text-ink-faint" /> My progress
              </Link>
              <form action={signOutAction}>
                <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-danger hover:bg-danger-soft" role="menuitem">
                  <LogOut size={14} /> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {nameOpen && typeof document !== "undefined" && createPortal(<NamePrompt first={props.user.firstName ?? ""} last={props.user.lastName ?? ""} onClose={() => setNameOpen(false)} />, document.querySelector("[data-ws-theme]") ?? document.body)}
      {searchOpen && <SearchPalette slug={workspace.slug} onClose={() => setSearchOpen(false)} />}
      {overdueOpen && <OverduePanel slug={workspace.slug} items={props.overdue} me={props.me} canEdit={canEdit} onClose={() => setOverdueOpen(false)} />}
    </aside>
  );
}

function NavItem({ href, icon, label, active, badge }: { href: string; icon: React.ReactNode; label: string; active?: boolean; badge?: number }) {
  return (
    <Link href={href} data-active={active ? "true" : "false"} className="nav-item">
      <span className={active ? "text-accent" : "text-ink-faint"}>{icon}</span> {label}
      {badge ? <span className="num ml-auto rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">{badge}</span> : null}
    </Link>
  );
}

function WorkspaceSwitcher({ current, all, canCreate }: { current: Ws; all: Ws[]; canCreate: boolean }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Element) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative p-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-card/60 px-2.5 py-2 text-left hover:bg-hover" style={{ boxShadow: `inset 0 0 0 1px ${current.color}22` }}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ring-1" style={{ background: `${current.color}40`, ["--tw-ring-color" as string]: `${current.color}99` }}>
          {current.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{current.name}</span>
          <span className="block text-[11px] text-ink-faint">Switch company</span>
        </span>
        <ChevronDown size={14} className="text-ink-faint" />
      </button>
      {open && (
        <div className="absolute left-2 right-2 z-30 mt-1 rounded-lg border border-line bg-card p-1 shadow-lg">
          <Link href="/" onClick={() => setOpen(false)} className="block rounded-md px-2 py-1.5 text-xs text-ink-faint hover:bg-hover">← All companies</Link>
          {all.map((w) => (
            <Link key={w.slug} href={`/w/${w.slug}`} onClick={() => setOpen(false)} className={`flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover ${w.slug === current.slug ? "bg-hover" : ""}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded text-sm" style={{ background: `${w.color}40` }}>
                {w.icon}
              </span>
              <span className="truncate">{w.name}</span>
            </Link>
          ))}
          {canCreate && (
            <button
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2 py-1.5 text-ink-soft hover:bg-hover"
            >
              <Plus size={14} /> New workspace
            </button>
          )}
        </div>
      )}
      {creating && <NewWorkspaceDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page tree with drag and drop: drop on the middle of a page to nest it inside,
// near the top or bottom edge to place it before or after.
// ---------------------------------------------------------------------------

type DropZone = { id: string; zone: "before" | "inside" | "after" } | null;
const EXPANDED_KEY = "hq.expanded";

function PageTree({ slug, nodes, canEdit, onNew }: { slug: string; nodes: Node[]; canEdit: boolean; onNew: (parentId: string | null) => void }) {
  const pathname = usePathname();
  const [, start] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropZone>(null);
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    try {
      setExpanded(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "{}"));
    } catch {}
  }, []);
  const toggle = (id: string, value?: boolean) =>
    setExpanded((e) => {
      const next = { ...e, [id]: value ?? !e[id] };
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const children = useMemo(() => {
    const m = new Map<string | null, Node[]>();
    for (const n of nodes) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n]);
    for (const list of m.values()) list.sort((a, b) => a.position - b.position);
    return m;
  }, [nodes]);

  // Auto-expand ancestors of the open page.
  const activeId = pathname.split("/p/")[1];
  useEffect(() => {
    if (!activeId) return;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let cur = byId.get(activeId)?.parentId;
    while (cur) {
      if (!expanded[cur]) toggle(cur, true);
      cur = byId.get(cur)?.parentId ?? null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const isDescendant = (maybeChild: string, ancestor: string): boolean => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let cur = byId.get(maybeChild)?.parentId;
    while (cur) {
      if (cur === ancestor) return true;
      cur = byId.get(cur)?.parentId;
    }
    return false;
  };

  const commitDrop = () => {
    if (!drag || !drop || drag === drop.id || isDescendant(drop.id, drag)) return reset();
    const target = nodes.find((n) => n.id === drop.id)!;
    let parentId: string | null;
    let position: number;
    if (drop.zone === "inside") {
      parentId = target.id;
      const kids = children.get(target.id) ?? [];
      position = (kids.at(-1)?.position ?? 0) + 1;
      toggle(target.id, true);
    } else {
      parentId = target.parentId;
      const sibs = (children.get(parentId) ?? []).filter((s) => s.id !== drag);
      const i = sibs.findIndex((s) => s.id === target.id);
      const neighbor = drop.zone === "before" ? sibs[i - 1] : sibs[i + 1];
      position = neighbor ? (target.position + neighbor.position) / 2 : target.position + (drop.zone === "before" ? -1 : 1);
    }
    const id = drag;
    start(() => movePageAction(slug, id, parentId, position));
    reset();
  };
  const reset = () => {
    setDrag(null);
    setDrop(null);
  };

  const render = (parentId: string | null, depth: number): React.ReactNode =>
    (children.get(parentId) ?? []).map((n) => {
      const kids = children.get(n.id) ?? [];
      const open = expanded[n.id];
      const active = activeId === n.id;
      const dz = drop?.id === n.id ? drop.zone : null;
      return (
        <div key={n.id}>
          <div
            draggable={canEdit}
            onDragStart={(e) => {
              setDrag(n.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={reset}
            onDragOver={(e) => {
              if (!drag || drag === n.id) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const y = (e.clientY - r.top) / r.height;
              setDrop({ id: n.id, zone: y < 0.28 ? "before" : y > 0.72 ? "after" : "inside" });
            }}
            onDrop={(e) => {
              e.preventDefault();
              commitDrop();
            }}
            className={`group relative flex items-center rounded-md pr-1 ${active ? "bg-hover font-medium text-ink" : "text-ink-soft hover:bg-hover"} ${dz === "inside" ? "ring-2 ring-accent/50" : ""} ${drag === n.id ? "opacity-40" : ""}`}
            style={{ paddingLeft: 4 + depth * 14 }}
          >
            {dz === "before" && <div className="absolute -top-px left-2 right-2 h-0.5 rounded bg-accent" />}
            {dz === "after" && <div className="absolute -bottom-px left-2 right-2 h-0.5 rounded bg-accent" />}
            <button onClick={() => toggle(n.id)} className="rounded p-1.5 text-ink-faint hover:bg-line md:p-0.5" aria-label={open ? "Collapse" : "Expand"}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} className={kids.length ? "" : "opacity-40"} />}
            </button>
            <Link href={`/w/${slug}/p/${n.id}`} className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-0.5 md:min-h-0">
              <span className="w-5 shrink-0 text-center">{n.icon ?? "📄"}</span>
              <span className="truncate">{n.title || "Untitled"}</span>
              {n.source === "gdrive" && <span title="Synced from Google Drive" className="text-[10px] text-ink-faint">Drive</span>}
            </Link>
            {canEdit && (
              <div className="relative flex md:opacity-0 md:group-hover:opacity-100">
                <button onClick={() => setMenu(menu === n.id ? null : n.id)} className="rounded p-1.5 text-ink-faint hover:bg-line hover:text-ink md:p-0.5" title="More">
                  <MoreHorizontal size={14} />
                </button>
                <button
                  onClick={() => {
                    toggle(n.id, true);
                    onNew(n.id);
                  }}
                  className="rounded p-1.5 text-ink-faint hover:bg-line hover:text-ink md:p-0.5"
                  title="Add a page inside"
                >
                  <Plus size={14} />
                </button>
                {menu === n.id && (
                  <div className="absolute right-0 top-6 z-30 w-44 rounded-lg border border-line bg-card p-1 text-ink shadow-lg" onMouseLeave={() => setMenu(null)}>
                    <button className="w-full rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => (setMenu(null), onNew(n.id))}>
                      Add page inside
                    </button>
                    <button
                      className="w-full rounded px-2 py-1.5 text-left text-danger hover:bg-danger-soft"
                      onClick={() => {
                        setMenu(null);
                        start(() => archivePageAction(slug, n.id));
                      }}
                    >
                      Move to Trash
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {open && (kids.length ? render(n.id, depth + 1) : <div className="py-1 text-xs text-ink-faint" style={{ paddingLeft: 30 + depth * 14 }}>No pages inside</div>)}
        </div>
      );
    });

  return <div onDragLeave={(e) => e.currentTarget === e.target && setDrop(null)}>{render(null, 0)}</div>;
}
