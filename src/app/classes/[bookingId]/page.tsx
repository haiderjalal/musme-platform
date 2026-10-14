import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { requireUser } from "@/features/auth/session";
import { isWithinJoinWindow, joinWindowOpensAt } from "@/features/booking/domain/join-window";
import { getMyBooking } from "@/features/booking/my-bookings";
import { PracticeRoom } from "@/features/practice-room";
import { formatDateTimeInZone } from "@/utils/format";

export const metadata: Metadata = {
  title: "Classroom",
  robots: { index: false, follow: false },
};

interface ClassPageProps {
  params: Promise<{ bookingId: string }>;
}

export default async function ClassroomPage({
  params,
}: ClassPageProps): Promise<React.ReactElement> {
  await connection();
  const { bookingId } = await params;
  const parsedId = z.uuid().safeParse(bookingId);
  if (!parsedId.success) notFound();

  const user = await requireUser(ROUTES.classRoom(parsedId.data));
  const booking = await getMyBooking(parsedId.data);
  if (!booking) notFound();

  const now = new Date();
  const confirmed = booking.status === "confirmed" || booking.status === "in_progress";
  const joinable = confirmed && isWithinJoinWindow(booking, now);
  const opensAt = joinWindowOpensAt(booking);

  return (
    <main id="main" className="min-h-dvh bg-room-bg text-room-ink">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-room-accent">
              Live lesson
            </p>
            <h1 className="text-xl font-bold">
              {booking.offeringTitle} with {booking.counterpartName}
            </h1>
            <p className="text-sm text-room-muted">
              <time dateTime={booking.startsAt.toISOString()}>
                {formatDateTimeInZone(booking.startsAt, user.timezone)}
              </time>
            </p>
          </div>
          <Link
            href={ROUTES.learnBookings}
            className="text-sm text-room-muted underline underline-offset-4"
          >
            Back to my lessons
          </Link>
        </header>

        {joinable ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <section
              aria-label="Video call"
              className="grid min-h-80 place-items-center rounded-3xl border border-white/10 bg-room-surface p-8 text-center"
            >
              <div className="grid max-w-sm gap-2">
                <p className="font-semibold">Live video is not connected yet.</p>
                <p className="text-sm text-room-muted">
                  The video provider is still being chosen. The practice tools on the right work
                  now.
                </p>
              </div>
            </section>
            <PracticeRoom />
          </div>
        ) : (
          <ClosedState
            confirmed={confirmed}
            opensAt={opensAt}
            endsAt={booking.endsAt}
            zone={user.timezone}
            now={now}
          />
        )}
      </div>
    </main>
  );
}

function ClosedState({
  confirmed,
  opensAt,
  endsAt,
  zone,
  now,
}: {
  confirmed: boolean;
  opensAt: Date;
  endsAt: Date;
  zone: string;
  now: Date;
}): React.ReactElement {
  const message = !confirmed
    ? "This lesson is not confirmed yet. The classroom opens once payment is complete."
    : now < opensAt
      ? `The classroom opens at ${formatDateTimeInZone(opensAt, zone)}.`
      : `This lesson ended at ${formatDateTimeInZone(endsAt, zone)}.`;

  return (
    <section className="grid place-items-center rounded-3xl border border-white/10 bg-room-surface p-10 text-center">
      <p role="status" className="max-w-md text-room-ink">
        {message}
      </p>
    </section>
  );
}
