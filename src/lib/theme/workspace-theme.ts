/**
 * A company's brand color becomes --ws-accent on the workspace wrapper; globals.css
 * mixes it into the accent, backgrounds, borders and hover for both themes. Keeping
 * only the one variable inline means light/dark switching needs no JavaScript.
 */
export function workspaceThemeVars(color: string): Record<string, string> {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#6366f1";
  return { "--ws-accent": c };
}

export const BRAND_SWATCHES = ["#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#16a34a", "#14b8a6", "#0ea5e9", "#3b82f6", "#64748b"];

export type ThemeChoice = "dark" | "light" | "system";
export const THEME_COOKIE = "orbit_theme";
