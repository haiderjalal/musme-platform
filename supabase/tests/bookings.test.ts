import { describe, expect, it } from "vitest";

import {
  PEOPLE,
  SLOTS,
  captureSqlState,
  createBooking,
  createOffering,
  createWorld,
  registerTestDatabase,
} from "./helpers";

const getDb = registerTestDatabase();

const EXCLUSION_VIOLATION = "23P01";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

describe("booking double-booking guard", () => {
  it("rejects an overlapping confirmed booking for the same teacher", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerB,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        ...SLOTS.overlapping,
      }),
    );

    expect(state).toBe(EXCLUSION_VIOLATION);
  });

  it("allows adjacent bookings because the ranges are half-open", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerB,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        ...SLOTS.adjacent,
      }),
    );

    expect(state).toBeUndefined();
  });

  it("allows overlapping times for different teachers", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerB,
        teacherId: PEOPLE.teacherU,
        offeringId: world.offeringU,
        ...SLOTS.first,
      }),
    );

    expect(state).toBeUndefined();
  });

  it("does not block a slot held by a cancelled booking", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "cancelled",
      ...SLOTS.first,
    });

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerB,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        ...SLOTS.first,
      }),
    );

    expect(state).toBeUndefined();
  });

  it("holds a slot for a pending_payment booking", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "pending_payment",
      ...SLOTS.first,
    });

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerB,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        ...SLOTS.first,
      }),
    );

    expect(state).toBe(EXCLUSION_VIOLATION);
  });

  it("treats in_progress as a blocking status", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "in_progress",
      ...SLOTS.first,
    });

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerB,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        ...SLOTS.overlapping,
      }),
    );

    expect(state).toBe(EXCLUSION_VIOLATION);
  });
});

describe("booking idempotency", () => {
  it("rejects a second booking from the same learner with the same idempotency key", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const idempotencyKey = "40000000-0000-4000-8000-000000000001";
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      idempotencyKey,
      ...SLOTS.first,
    });

    // A different, non-overlapping slot isolates the unique violation from the exclusion check.
    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerA,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        idempotencyKey,
        ...SLOTS.adjacent,
      }),
    );

    expect(state).toBe(UNIQUE_VIOLATION);
  });

  it("allows the same idempotency key for a different learner", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const idempotencyKey = "40000000-0000-4000-8000-000000000002";
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      idempotencyKey,
      ...SLOTS.first,
    });

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerB,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        idempotencyKey,
        ...SLOTS.adjacent,
      }),
    );

    expect(state).toBeUndefined();
  });
});

describe("booking insert rules", () => {
  it("rejects a booking that starts in the past", async () => {
    const db = getDb();
    const world = await createWorld(db);

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerA,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        startsAt: "2020-01-01T10:00:00Z",
        endsAt: "2020-01-01T11:00:00Z",
      }),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });

  it("rejects a booking whose length does not match the offering", async () => {
    const db = getDb();
    const world = await createWorld(db);

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerA,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        startsAt: "2099-06-01T10:00:00Z",
        endsAt: "2099-06-01T10:30:00Z",
      }),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });

  it("accepts a booking whose length matches a 30-minute offering", async () => {
    const db = getDb();
    await createWorld(db);
    const shortOffering = await createOffering(db, PEOPLE.teacherT, 30);

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.learnerA,
        teacherId: PEOPLE.teacherT,
        offeringId: shortOffering,
        startsAt: "2099-06-01T10:00:00Z",
        endsAt: "2099-06-01T10:30:00Z",
      }),
    );

    expect(state).toBeUndefined();
  });

  it("requires hold_expires_at while a booking is pending_payment", async () => {
    const db = getDb();
    const world = await createWorld(db);

    const state = await captureSqlState(db, () =>
      db.query(
        `insert into public.bookings
           (learner_id, teacher_id, offering_id, starts_at, ends_at, status, price_minor, currency, idempotency_key)
         values ($1, $2, $3, $4, $5, 'pending_payment', 5000, 'USD', gen_random_uuid())`,
        [
          PEOPLE.learnerA,
          PEOPLE.teacherT,
          world.offeringT,
          SLOTS.first.startsAt,
          SLOTS.first.endsAt,
        ],
      ),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });

  it("rejects a teacher booking their own lesson", async () => {
    const db = getDb();
    const world = await createWorld(db);

    const state = await captureSqlState(db, () =>
      createBooking(db, {
        learnerId: PEOPLE.teacherT,
        teacherId: PEOPLE.teacherT,
        offeringId: world.offeringT,
        ...SLOTS.first,
      }),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });
});
