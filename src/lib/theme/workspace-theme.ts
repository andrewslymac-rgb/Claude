/**
 * Turns a company's brand color into a full theme: accent plus tinted backgrounds,
 * sidebar, cards, borders and hover. Everything stays dark and readable; the
 * color just soaks through. Used by the workspace layout and the live preview.
 */
export function workspaceThemeVars(color: string): Record<string, string> {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#6366f1";
  return {
    "--ws-accent": c,
    "--color-accent": `color-mix(in oklab, ${c} 72%, white)`,
    "--color-accent-soft": `color-mix(in srgb, ${c} 22%, transparent)`,
    "--color-paper": `color-mix(in oklab, #0b1020 90%, ${c} 10%)`,
    "--color-side": `color-mix(in oklab, #10172a 82%, ${c} 18%)`,
    "--color-card": `color-mix(in oklab, #19233d 80%, ${c} 20%)`,
    "--color-hover": `color-mix(in oklab, #222e4d 74%, ${c} 26%)`,
    "--color-line": `color-mix(in oklab, #2a3656 70%, ${c} 30%)`,
  };
}

export const BRAND_SWATCHES = ["#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#16a34a", "#14b8a6", "#0ea5e9", "#3b82f6", "#64748b"];
