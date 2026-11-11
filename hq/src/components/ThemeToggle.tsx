"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type ThemeChoice } from "@/lib/theme/workspace-theme";

const OPTIONS: { key: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { key: "dark", label: "Dark", icon: <Moon size={13} /> },
  { key: "light", label: "Light", icon: <Sun size={13} /> },
  { key: "system", label: "Auto", icon: <Monitor size={13} /> },
];

/** Applies a theme choice right away and remembers it (cookie, so the server renders the right one next time). */
export function applyTheme(choice: ThemeChoice) {
  const resolved = choice === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
  document.documentElement.dataset.theme = resolved;
  // Browser chrome and the iPhone status bar follow right away, without a reload.
  const color = resolved === "light" ? "#f5f6fb" : "#0f1526";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem(THEME_COOKIE, choice);
  } catch {}
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>("dark");
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )orbit_theme=(dark|light|system)/);
    if (m) setChoice(m[1] as ThemeChoice);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => document.cookie.includes("orbit_theme=system") && applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return (
    <div className="flex overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={choice === o.key}
          onClick={() => (setChoice(o.key), applyTheme(o.key))}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] ${choice === o.key ? "bg-accent-soft font-semibold text-accent" : "text-ink-soft hover:bg-hover hover:text-ink"}`}
          title={o.label}
        >
          {o.icon} {!compact && o.label}
        </button>
      ))}
    </div>
  );
}

/** The theme currently painted ("light" or "dark"), kept in sync with the toggle. */
export function useResolvedTheme(): "light" | "dark" {
  const [t, setT] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const read = () => setT(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return t;
}
