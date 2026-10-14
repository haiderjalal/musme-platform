import Link from "next/link";

import { cn } from "@/utils/cn";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; href: string };
  className?: string;
}

/** Shown when a list or search has no results. Always says what the user can do next. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface p-8 text-center",
        className,
      )}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-muted">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-ink"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * Friendly failure panel for error.tsx. It never shows internal error details.
 * Support contact is shown so a user always has somewhere to go.
 */
export function ErrorState({
  title = "Something went wrong on our side.",
  description = "We could not load this page. Try again. If it keeps happening, contact support.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="grid justify-items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center"
    >
      <h2 className="text-lg font-semibold text-danger">{title}</h2>
      <p className="max-w-prose text-sm text-muted">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-11 cursor-pointer rounded-xl bg-primary px-4 text-sm font-semibold text-primary-ink"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Placeholder with the same footprint as the content, so the layout does not jump on load. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-2xl bg-surface-2", className)} />
  );
}
