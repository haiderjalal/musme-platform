import type { Metadata } from "next";
import { connection } from "next/server";

import { EmptyState } from "@/components/shared/state-panels";
import { TeacherCard } from "@/features/teachers/components/teacher-card";
import { TeacherFilters } from "@/features/teachers/components/teacher-filters";
import { listInstruments } from "@/features/teachers/instrument-repository";
import { listApprovedTeachers } from "@/features/teachers/repository";
import { teacherFiltersSchema } from "@/features/teachers/schemas";
import { ROUTES } from "@/constants/routes";

export const metadata: Metadata = {
  title: "Find a music teacher",
  description: "Browse approved music teachers, read their profiles and book a live lesson.",
  alternates: { canonical: ROUTES.teachers },
};

interface TeachersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeachersPage({
  searchParams,
}: TeachersPageProps): Promise<React.ReactElement> {
  await connection();
  const raw = await searchParams;
  const parsed = teacherFiltersSchema.safeParse({
    instrument: first(raw.instrument),
    q: first(raw.q),
  });
  const filters = parsed.success ? parsed.data : {};

  const [instruments, teachers] = await Promise.all([
    listInstruments(),
    listApprovedTeachers({ instrument: filters.instrument, query: filters.q?.trim() || undefined }),
  ]);

  return (
    <main id="main" className="mx-auto grid max-w-6xl gap-8 px-4 pb-20 pt-10">
      <header className="motion-rise grid gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Live lessons</p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight">
          Learn with a teacher who is right for you.
        </h1>
        <p className="max-w-prose text-muted">
          Every teacher is reviewed before they appear here. Book a live lesson in your own time
          zone.
        </p>
      </header>

      <TeacherFilters instruments={instruments} selected={filters.instrument} query={filters.q} />

      {teachers.length === 0 ? (
        <EmptyState
          title="No teachers match these filters yet."
          description="Try a different instrument or clear the search. New teachers are added after review."
          action={{ label: "Show all teachers", href: ROUTES.teachers }}
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Teachers">
          {teachers.map((teacher, index) => (
            <li key={teacher.profileId}>
              <TeacherCard teacher={teacher} index={index} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
