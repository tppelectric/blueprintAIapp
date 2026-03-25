import Link from "next/link";
import type { ReactNode } from "react";

/** Section heading with gold accent rule (per UI polish spec). */
export function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`app-section-title text-lg font-semibold text-[var(--foreground)] ${className}`}
    >
      {children}
    </h2>
  );
}

/** Friendly empty state with optional CTA. */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="app-card app-card-pad-lg flex flex-col items-center justify-center py-12 text-center">
      {icon ? (
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[#E8C84A]/25 bg-[#E8C84A]/10 text-2xl text-[#E8C84A]"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-[var(--foreground)]">
        {title}
      </p>
      {description ? (
        <p className="app-muted mt-2 max-w-md text-sm">{description}</p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="btn-primary mt-6 inline-flex">
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction ? (
        <button type="button" className="btn-primary mt-6" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function DashboardProjectCardSkeleton() {
  return (
    <li className="app-card app-card-pad-lg flex h-full animate-pulse flex-col">
      <div className="mb-4 h-24 rounded-xl bg-white/10" />
      <div className="h-5 w-3/4 rounded bg-white/10" />
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-white/5" />
        <div className="h-3 w-5/6 rounded bg-white/5" />
        <div className="h-3 w-2/3 rounded bg-white/5" />
      </div>
      <div className="mt-6 h-10 rounded-lg bg-white/10" />
    </li>
  );
}

export function DashboardProjectSkeletonGrid() {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <DashboardProjectCardSkeleton key={i} />
      ))}
    </ul>
  );
}

export function JobListSkeleton() {
  return (
    <ul className="mt-8 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="app-card flex animate-pulse flex-col gap-3 p-4 sm:flex-row"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-48 rounded bg-white/10" />
            <div className="h-3 w-32 rounded bg-white/5" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-14 rounded-lg bg-white/10" />
            <div className="h-8 w-14 rounded-lg bg-white/10" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CustomerListSkeleton() {
  return (
    <ul className="mt-8 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="app-card animate-pulse p-4">
          <div className="h-4 w-56 rounded bg-white/10" />
          <div className="mt-2 h-3 w-full max-w-md rounded bg-white/5" />
          <div className="mt-3 flex gap-2">
            <div className="h-8 w-16 rounded-lg bg-white/10" />
            <div className="h-8 w-16 rounded-lg bg-white/10" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Inline skeleton for tool result panels. */
export function ToolResultsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="app-card app-card-pad-lg space-y-3" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg bg-white/[0.06]"
        />
      ))}
    </div>
  );
}
