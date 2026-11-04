/** The Orbit mark: a ring with two orbiting dots. Uses currentColor. */
export function OrbitLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path d="M16 4.5a11.5 11.5 0 0 1 11.3 13.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16 27.5A11.5 11.5 0 0 1 4.7 13.9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.2" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="26.3" cy="7.2" r="2.1" fill="currentColor" />
      <circle cx="5.7" cy="24.8" r="2.1" fill="currentColor" />
    </svg>
  );
}

export function OrbitWordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2 text-accent">
      <OrbitLogo size={size} />
      <span className="font-bold tracking-tight text-ink" style={{ fontSize: size * 0.95 }}>
        orbit
      </span>
    </span>
  );
}
