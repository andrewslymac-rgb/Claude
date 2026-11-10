import type { ReactNode } from "react";

/** The standard top of every screen: eyebrow, title, one-line purpose, actions on the right. */
export function PageHeader({ eyebrow, title, subtitle, actions, icon }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="page-title flex items-center gap-2.5">
          {icon}
          <span className="min-w-0">{title}</span>
        </h1>
        {subtitle && <p className="page-sub max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
