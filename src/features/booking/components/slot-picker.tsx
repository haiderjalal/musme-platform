import { randomUUID } from "node:crypto";

import { SubmitButton } from "@/components/ui/submit-button";
import type { OfferingSummary } from "@/features/teachers/types";
import { formatDayInZone, formatDateTimeInZone, formatTimeInZone } from "@/utils/format";
import { formatDateKey, localDateOf } from "@/utils/zoned-time";

import { requestLessonFormAction } from "../actions";
import type { Slot } from "../domain/slots";

interface SlotPickerProps {
  teacherSlug: string;
  offering: OfferingSummary;
  slots: Slot[];
  /** Zone the times are shown in: the learner's zone when signed in, otherwise the teacher's. */
  displayZone: string;
  signedIn: boolean;
}

interface DayGroup {
  key: string;
  label: string;
  slots: Slot[];
}

/**
 * Slots grouped by local day. Each slot is its own small form, so booking needs no client
 * JavaScript. The idempotency key is generated per render: a double submit of the same page
 * sends the same key and so creates one booking.
 */
export function SlotPicker({
  teacherSlug,
  offering,
  slots,
  displayZone,
  signedIn,
}: SlotPickerProps) {
  if (slots.length === 0) {
    return (
      <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">
        No open times in the next two weeks for this lesson length. Try another length or check back
        later.
      </p>
    );
  }

  const groups = groupByLocalDay(slots, displayZone);
  const idempotencyKey = randomUUID();

  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`day-${group.key}`} className="grid gap-2">
          <h3 id={`day-${group.key}`} className="text-sm font-semibold text-muted">
            {group.label}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {group.slots.map((slot) => {
              const time = formatTimeInZone(slot.startsAt, displayZone);
              return (
                <li key={slot.startsAt.toISOString()}>
                  {signedIn ? (
                    <form action={requestLessonFormAction}>
                      <input type="hidden" name="teacherSlug" value={teacherSlug} />
                      <input type="hidden" name="offeringId" value={offering.id} />
                      <input type="hidden" name="startsAt" value={slot.startsAt.toISOString()} />
                      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
                      <SubmitButton
                        variant="secondary"
                        pendingLabel="Holding…"
                        className="min-h-11 min-w-28 tabular-nums"
                      >
                        {time}
                        <span className="sr-only">
                          {" "}
                          on {formatDateTimeInZone(slot.startsAt, displayZone)}
                        </span>
                      </SubmitButton>
                    </form>
                  ) : (
                    <a
                      href={`/login?next=${encodeURIComponent(`/teachers/${teacherSlug}`)}`}
                      className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold tabular-nums"
                    >
                      {time}
                      <span className="sr-only"> (sign in to hold this time)</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByLocalDay(slots: Slot[], timeZone: string): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const slot of slots) {
    const key = formatDateKey(localDateOf(slot.startsAt, timeZone));
    const existing = groups.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.set(key, { key, label: formatDayInZone(slot.startsAt, timeZone), slots: [slot] });
    }
  }
  return [...groups.values()];
}
