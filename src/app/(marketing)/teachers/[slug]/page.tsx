import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { SlotPicker } from "@/features/booking/components/slot-picker";
import { getOpenSlots } from "@/features/booking/availability";
import { getCurrentUser } from "@/features/auth/session";
import { getApprovedTeacherBySlug } from "@/features/teachers/repository";
import { teacherSlugSchema } from "@/features/teachers/schemas";
import type { OfferingSummary, TeacherDetail } from "@/features/teachers/types";
import { formatMoney } from "@/utils/format";
import { getSiteUrl } from "@/lib/site-url";

interface TeacherPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: TeacherPageProps): Promise<Metadata> {
  const { slug } = await params;
  const teacher = await loadTeacher(slug);
  if (!teacher) return { title: "Teacher not found", robots: { index: false } };

  const title = `${teacher.displayName}, ${teacher.instruments.map((i) => i.name).join(" and ") || "music"} teacher`;
  return {
    title,
    description: teacher.headline,
    alternates: { canonical: ROUTES.teacher(teacher.slug) },
    openGraph: { title, description: teacher.headline, url: ROUTES.teacher(teacher.slug) },
    twitter: { card: "summary", title, description: teacher.headline },
  };
}

export default async function TeacherPage({
  params,
  searchParams,
}: TeacherPageProps): Promise<React.ReactElement> {
  await connection();
  const { slug } = await params;
  const teacher = await loadTeacher(slug);
  if (!teacher) notFound();

  const raw = await searchParams;
  const user = await getCurrentUser();
  const offering = pickOffering(teacher.offerings, first(raw.offering));
  const notice = first(raw.notice);

  const { timeZone, slots } = offering
    ? await getOpenSlots({
        teacherId: teacher.profileId,
        durationMinutes: offering.durationMinutes,
        now: new Date(),
      })
    : { timeZone: teacher.timezone, slots: [] };
  const displayZone = user?.timezone ?? timeZone;

  return (
    <main
      id="main"
      className="mx-auto grid max-w-6xl gap-8 px-4 pb-20 pt-10 lg:grid-cols-[1fr_400px]"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd(teacher)) }}
      />

      <div className="grid min-w-0 content-start gap-6">
        <header className="motion-rise flex flex-wrap items-center gap-5">
          <div
            aria-hidden="true"
            className="grid size-24 shrink-0 place-items-center rounded-[28px] bg-linear-to-br from-primary to-accent text-3xl font-bold text-primary-ink"
          >
            {initialsOf(teacher.displayName)}
          </div>
          <div className="grid gap-2">
            <h1 className="text-4xl font-bold leading-tight">{teacher.displayName}</h1>
            <p className="text-muted">{teacher.headline}</p>
            <p className="text-sm text-muted">
              {teacher.instruments.map((i) => i.name).join(" · ")}
              {teacher.languages.length ? ` · ${teacher.languages.join(", ")}` : ""}
            </p>
          </div>
        </header>

        <section
          aria-labelledby="about-heading"
          className="grid gap-3 rounded-[18px] border border-line bg-surface p-6"
        >
          <h2 id="about-heading" className="text-lg font-semibold">
            About
          </h2>
          <p className="max-w-prose whitespace-pre-line text-muted">{teacher.bio}</p>
        </section>

        <section
          aria-labelledby="lessons-heading"
          className="grid gap-3 rounded-[18px] border border-line bg-surface p-6"
        >
          <h2 id="lessons-heading" className="text-lg font-semibold">
            Lessons
          </h2>
          {teacher.offerings.length === 0 ? (
            <p className="text-sm text-muted">This teacher has not listed a lesson yet.</p>
          ) : (
            <ul className="grid gap-3">
              {teacher.offerings.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4"
                >
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-muted">{item.durationMinutes} minutes</p>
                  </div>
                  <p className="font-bold">{formatMoney(item.priceMinor, item.currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside
        aria-labelledby="book-heading"
        className="grid content-start gap-5 rounded-[18px] border border-line bg-surface p-6 lg:sticky lg:top-24"
      >
        <div className="grid gap-1">
          <h2 id="book-heading" className="text-lg font-semibold">
            Book a lesson
          </h2>
          <p className="text-sm text-muted">
            Times are shown in {displayZone}. A slot is held for 15 minutes while you pay.
          </p>
        </div>

        {notice ? <NoticeBanner code={notice} /> : null}

        {offering ? (
          <>
            <form method="get" className="grid gap-1.5">
              <label htmlFor="offering" className="text-sm font-semibold">
                Lesson length
              </label>
              <select
                id="offering"
                name="offering"
                defaultValue={offering.id}
                className="min-h-11 rounded-xl border border-line bg-surface px-3"
              >
                {teacher.offerings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.durationMinutes} min ·{" "}
                    {formatMoney(item.priceMinor, item.currency)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="min-h-11 cursor-pointer rounded-xl border border-line px-4 text-sm font-semibold"
              >
                Update times
              </button>
            </form>
            <SlotPicker
              teacherSlug={teacher.slug}
              offering={offering}
              slots={slots}
              displayZone={displayZone}
              signedIn={Boolean(user)}
            />
          </>
        ) : (
          <p className="text-sm text-muted">No lessons are open for booking yet.</p>
        )}
      </aside>
    </main>
  );
}

async function loadTeacher(slug: string): Promise<TeacherDetail | null> {
  const parsed = teacherSlugSchema.safeParse(slug);
  if (!parsed.success) return null;
  return getApprovedTeacherBySlug(parsed.data);
}

function pickOffering(
  offerings: OfferingSummary[],
  requestedId: string | undefined,
): OfferingSummary | undefined {
  return offerings.find((item) => item.id === requestedId) ?? offerings[0];
}

const NOTICE_TEXT: Record<string, string> = {
  "slot-unavailable": "That time was just taken or is no longer available. Pick another time.",
  "lesson-unavailable": "This lesson is not available right now.",
  "own-lesson": "You cannot book your own lesson.",
  "hold-failed": "We could not hold that time. Try again in a moment.",
};

function NoticeBanner({ code }: { code: string }): React.ReactElement | null {
  const message = NOTICE_TEXT[code];
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-surface-2 p-3 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

function personJsonLd(teacher: TeacherDetail): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: teacher.displayName,
    description: teacher.headline,
    url: `${getSiteUrl()}${ROUTES.teacher(teacher.slug)}`,
    knowsLanguage: teacher.languages,
    knowsAbout: teacher.instruments.map((i) => i.name),
  };
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
