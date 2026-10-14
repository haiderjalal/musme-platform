import { describe, expect, it } from "vitest";

import {
  PEOPLE,
  SLOTS,
  actAs,
  actAsOwner,
  captureSqlState,
  createBooking,
  createWorld,
  registerTestDatabase,
} from "./helpers";

const getDb = registerTestDatabase();

const PERMISSION_DENIED = "42501";
const INVALID_PARAMETER = "22023";

const DAY_START = "2099-06-01T00:00:00Z";
const DAY_END = "2099-06-02T00:00:00Z";

interface BusyWindow {
  starts_at: Date;
  ends_at: Date;
}

/** Busy-window fixtures for teacherT, plus noise that must never appear in the result. */
async function seedCalendar(): Promise<void> {
  const db = getDb();
  const world = await createWorld(db);

  // Blocking: confirmed, pending_payment, in_progress.
  await createBooking(db, {
    learnerId: PEOPLE.learnerA,
    teacherId: PEOPLE.teacherT,
    offeringId: world.offeringT,
    ...SLOTS.first,
  });
  await createBooking(db, {
    learnerId: PEOPLE.learnerB,
    teacherId: PEOPLE.teacherT,
    offeringId: world.offeringT,
    status: "pending_payment",
    startsAt: "2099-06-01T14:00:00Z",
    endsAt: "2099-06-01T15:00:00Z",
  });
  await createBooking(db, {
    learnerId: PEOPLE.learnerA,
    teacherId: PEOPLE.teacherT,
    offeringId: world.offeringT,
    status: "in_progress",
    startsAt: "2099-06-01T16:00:00Z",
    endsAt: "2099-06-01T17:00:00Z",
  });

  // Not blocking: cancelled, completed, and another teacher's booking.
  await createBooking(db, {
    learnerId: PEOPLE.learnerA,
    teacherId: PEOPLE.teacherT,
    offeringId: world.offeringT,
    status: "cancelled",
    startsAt: "2099-06-01T12:00:00Z",
    endsAt: "2099-06-01T13:00:00Z",
  });
  await createBooking(db, {
    learnerId: PEOPLE.learnerA,
    teacherId: PEOPLE.teacherT,
    offeringId: world.offeringT,
    status: "completed",
    startsAt: "2099-06-01T18:00:00Z",
    endsAt: "2099-06-01T19:00:00Z",
  });
  await createBooking(db, {
    learnerId: PEOPLE.learnerB,
    teacherId: PEOPLE.teacherU,
    offeringId: world.offeringU,
    ...SLOTS.first,
  });

  // Availability: one blocked window (counts), one extra window (does not), one blocked window outside the day.
  await db.query(
    `insert into public.availability_exceptions (teacher_id, starts_at, ends_at, kind) values
       ($1, '2099-06-01T09:00:00Z', '2099-06-01T09:30:00Z', 'blocked'),
       ($1, '2099-06-01T20:00:00Z', '2099-06-01T21:00:00Z', 'extra'),
       ($1, '2099-06-03T09:00:00Z', '2099-06-03T10:00:00Z', 'blocked')`,
    [PEOPLE.teacherT],
  );
}

async function fetchBusyWindows(from: string, to: string): Promise<BusyWindow[]> {
  const db = getDb();
  const { rows } = await db.query<BusyWindow>(
    "select starts_at, ends_at from public.teacher_busy_ranges($1, $2, $3) order by starts_at",
    [PEOPLE.teacherT, from, to],
  );
  return rows;
}

function asIsoPairs(windows: BusyWindow[]): Array<[string, string]> {
  return windows.map((window) => [window.starts_at.toISOString(), window.ends_at.toISOString()]);
}

describe("teacher_busy_ranges", () => {
  it("returns blocking bookings and blocked exceptions in the window, and nothing else", async () => {
    await seedCalendar();
    await actAs(getDb(), "anon");

    const windows = await fetchBusyWindows(DAY_START, DAY_END);
    await actAsOwner(getDb());

    expect(asIsoPairs(windows)).toEqual([
      ["2099-06-01T09:00:00.000Z", "2099-06-01T09:30:00.000Z"],
      ["2099-06-01T10:00:00.000Z", "2099-06-01T11:00:00.000Z"],
      ["2099-06-01T14:00:00.000Z", "2099-06-01T15:00:00.000Z"],
      ["2099-06-01T16:00:00.000Z", "2099-06-01T17:00:00.000Z"],
    ]);
  });

  it("includes a booking that only partly overlaps the requested window", async () => {
    await seedCalendar();
    await actAs(getDb(), "anon");

    const windows = await fetchBusyWindows("2099-06-01T10:30:00Z", "2099-06-01T10:45:00Z");
    await actAsOwner(getDb());

    expect(asIsoPairs(windows)).toEqual([["2099-06-01T10:00:00.000Z", "2099-06-01T11:00:00.000Z"]]);
  });

  it("treats a booking that ends exactly at the window start as non-overlapping", async () => {
    await seedCalendar();
    await actAs(getDb(), "anon");

    // The confirmed booking ends at 11:00 and the range is half-open, so it does not overlap [11:00, 12:00).
    const windows = await fetchBusyWindows("2099-06-01T11:00:00Z", "2099-06-01T12:00:00Z");
    await actAsOwner(getDb());

    expect(windows).toEqual([]);
  });

  it("exposes only starts_at and ends_at, so no learner or booking identifiers leak", async () => {
    await seedCalendar();
    const db = getDb();
    await actAs(db, "anon");

    const result = await db.query("select * from public.teacher_busy_ranges($1, $2, $3)", [
      PEOPLE.teacherT,
      DAY_START,
      DAY_END,
    ]);
    await actAsOwner(db);

    expect(result.fields.map((field) => field.name)).toEqual(["starts_at", "ends_at"]);
  });

  it("rejects a window whose end is not after its start", async () => {
    await seedCalendar();
    const db = getDb();
    await actAs(db, "anon");

    const state = await captureSqlState(db, () =>
      db.query("select * from public.teacher_busy_ranges($1, $2, $3)", [
        PEOPLE.teacherT,
        DAY_END,
        DAY_START,
      ]),
    );
    await actAsOwner(db);

    expect(state).toBe(INVALID_PARAMETER);
  });

  it("returns no rows for a day with no busy time", async () => {
    await seedCalendar();

    const windows = await fetchBusyWindows("2099-06-04T00:00:00Z", "2099-06-05T00:00:00Z");

    expect(windows).toEqual([]);
  });
});

describe("direct table access", () => {
  it("denies anon direct reads of bookings, so calendars must use teacher_busy_ranges", async () => {
    await seedCalendar();
    const db = getDb();
    await actAs(db, "anon");

    const state = await captureSqlState(db, () => db.query("select id from public.bookings"));
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies anon direct reads of availability_exceptions", async () => {
    await seedCalendar();
    const db = getDb();
    await actAs(db, "anon");

    const state = await captureSqlState(db, () =>
      db.query("select id from public.availability_exceptions"),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });
});
