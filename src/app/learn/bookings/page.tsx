import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { EmptyState } from "@/components/shared/state-panels";
import { ROUTES } from "@/constants/routes";
import { getPaymentProvider } from "@/features/payments/provider";
import { requireUser } from "@/features/auth/session";
import { listMyBookings, type BookingListItem } from "@/features/booking/my-bookings";
import { formatDateTimeInZone, formatMoney } from "@/utils/format";

export const metadata: Metadata = {
  title: "My lessons",
  robots: { index: false, follow: false },
};

interface BookingsPageProps {
  searchParams: Promise<{ held?: string }>;
}

export default async function LearnBookingsPage({
  searchParams,
}: BookingsPageProps): Promise<React.ReactElement> {
  await connection();
  const user = await requireUser(ROUTES.learnBookings);
  const { held } = await searchParams;
  const bookings = await listMyBookings(user.id, "learner");
  const paymentsEnabled = getPaymentProvider() !== null;

  return (
    <main id="main" className="mx-auto grid max-w-4xl gap-8 px-4 pb-20 pt-10">
      <header className="grid gap-2">
        <h1 className="text-3xl font-bold">My lessons</h1>
        <p className="text-muted">Lessons you have requested, held or booked.</p>
      </header>

      {held ? (
        <p role="status" className="rounded-xl bg-surface-2 p-4 text-sm">
          Your time is held for 15 minutes.{" "}
          {paymentsEnabled
            ? "Complete payment to confirm the lesson."
            : "Online payment is not enabled yet, so the lesson cannot be confirmed here."}
        </p>
      ) : null}

      {bookings.length === 0 ? (
        <EmptyState
          title="No lessons yet."
          description="Find a teacher, pick a time that suits you, and request a lesson."
          action={{ label: "Find a teacher", href: ROUTES.teachers }}
        />
      ) : (
        <ul className="grid gap-4">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <BookingRow booking={booking} zone={user.timezone} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const STATUS_LABEL: Record<BookingListItem["status"], string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
  refunded: "Refunded",
  expired: "Hold expired",
};

function BookingRow({
  booking,
  zone,
}: {
  booking: BookingListItem;
  zone: string;
}): React.ReactElement {
  const canJoin = booking.status === "confirmed" || booking.status === "in_progress";
  return (
    <article className="grid gap-3 rounded-[18px] border border-line bg-surface p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="grid gap-1">
        <p className="text-sm font-semibold text-primary">{STATUS_LABEL[booking.status]}</p>
        <h2 className="text-lg font-semibold">
          {booking.offeringTitle} with {booking.counterpartName}
        </h2>
        <p className="text-sm text-muted">
          <time dateTime={booking.startsAt.toISOString()}>
            {formatDateTimeInZone(booking.startsAt, zone)}
          </time>
          {" · "}
          {formatMoney(booking.priceMinor, booking.currency)}
        </p>
      </div>
      {canJoin ? (
        <Link
          href={ROUTES.classRoom(booking.id)}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-ink"
        >
          Open classroom
        </Link>
      ) : null}
    </article>
  );
}
