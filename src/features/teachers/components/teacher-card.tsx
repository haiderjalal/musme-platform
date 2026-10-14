import Link from "next/link";

import { ROUTES } from "@/constants/routes";
import { formatMoney } from "@/utils/format";

import type { TeacherSummary } from "../types";

interface TeacherCardProps {
  teacher: TeacherSummary;
  index: number;
}

/** One teacher in the listing. The staggered entrance is CSS only and respects reduced motion. */
export function TeacherCard({ teacher, index }: TeacherCardProps) {
  const lowest = teacher.offerings.reduce<{ priceMinor: number; currency: string } | null>(
    (best, offering) =>
      best === null || offering.priceMinor < best.priceMinor
        ? { priceMinor: offering.priceMinor, currency: offering.currency }
        : best,
    null,
  );

  return (
    <article
      className="motion-card-in group grid gap-4 rounded-[18px] border border-line bg-surface p-5 transition duration-300 hover:-translate-y-1 hover:shadow-card motion-reduce:transition-none"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-[20px] bg-linear-to-br from-primary to-accent text-lg font-bold text-primary-ink"
        >
          {initialsOf(teacher.displayName)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{teacher.displayName}</h2>
          <p className="line-clamp-2 text-sm text-muted">{teacher.headline}</p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Instruments and languages">
        {teacher.instruments.map((instrument) => (
          <li
            key={instrument.id}
            className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted"
          >
            {instrument.name}
          </li>
        ))}
        {teacher.languages.map((language) => (
          <li key={language} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
            {language}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-line pt-4">
        <p className="text-sm">
          {lowest === null ? (
            <span className="text-muted">No lessons listed yet</span>
          ) : (
            <>
              From{" "}
              <span className="font-bold">{formatMoney(lowest.priceMinor, lowest.currency)}</span>
            </>
          )}
        </p>
        <Link
          href={ROUTES.teacher(teacher.slug)}
          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold transition-colors hover:bg-surface-2"
        >
          View profile<span className="sr-only"> for {teacher.displayName}</span>
        </Link>
      </div>
    </article>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
