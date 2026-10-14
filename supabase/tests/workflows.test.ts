import { describe, expect, it } from "vitest";

import {
  PEOPLE,
  SLOTS,
  actAs,
  actAsOwner,
  captureSqlState,
  createAuthUser,
  createBooking,
  createTeacher,
  createWorld,
  registerTestDatabase,
} from "./helpers";

const getDb = registerTestDatabase();

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const INVALID_PARAMETER = "22023";
const NO_DATA_FOUND = "P0002";
const INVALID_STATE = "55000";

const PENDING_TEACHER = "20000000-0000-4000-8000-000000000003";
const REJECTED_TEACHER = "20000000-0000-4000-8000-000000000004";

async function insertCourse(teacherId: string, slug: string, status = "draft"): Promise<string> {
  const { rows } = await getDb().query<{ id: string }>(
    `insert into public.courses (teacher_id, slug, title, description, price_minor, currency, status)
     values ($1, $2, 'Course', 'Description', 0, 'USD', $3::public.course_status)
     returning id`,
    [teacherId, slug, status],
  );
  return rows[0]?.id ?? "";
}

async function auditRows(): Promise<
  Array<{ actor_id: string; action: string; to_status: string | null }>
> {
  const { rows } = await getDb().query<{
    actor_id: string;
    action: string;
    to_status: string | null;
  }>(
    "select actor_id, action, metadata->>'to' as to_status from public.admin_audit_log order by created_at",
  );
  return rows;
}

describe("teacher application", () => {
  it("lets a rejected teacher resubmit and clears the rejection reason", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, REJECTED_TEACHER, { fullName: "Rejected Teacher" });
    await createTeacher(db, REJECTED_TEACHER, "rejected-teacher", "rejected");
    await actAs(db, "authenticated", REJECTED_TEACHER);

    await db.query("select public.submit_teacher_application()");
    await actAsOwner(db);

    const { rows } = await db.query<{
      verification_status: string;
      rejection_reason: string | null;
    }>(
      "select verification_status::text, rejection_reason from public.teacher_profiles where profile_id = $1",
      [REJECTED_TEACHER],
    );
    expect(rows[0]).toEqual({ verification_status: "submitted", rejection_reason: null });
  });

  it("refuses to resubmit an approved application", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query("select public.submit_teacher_application()"),
    );
    await actAsOwner(db);

    expect(state).toBe(INVALID_STATE);
  });

  it("refuses when the caller has no teacher application", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query("select public.submit_teacher_application()"),
    );
    await actAsOwner(db);

    expect(state).toBe(NO_DATA_FOUND);
  });

  it("lets a new user create a teacher application only in the submitted state", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "New Applicant" });
    await actAs(db, "authenticated", PENDING_TEACHER);

    const accepted = await captureSqlState(db, () =>
      db.query(
        "insert into public.teacher_profiles (profile_id, slug) values ($1, 'new-applicant')",
        [PENDING_TEACHER],
      ),
    );
    await actAsOwner(db);

    expect(accepted).toBeUndefined();
  });

  it("denies a new application that tries to start approved", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "New Applicant" });
    await actAs(db, "authenticated", PENDING_TEACHER);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.teacher_profiles (profile_id, slug, verification_status, reviewed_at) values ($1, 'sneaky', 'approved', now())",
        [PENDING_TEACHER],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });
});

describe("admin teacher review", () => {
  it("denies a non-admin calling admin_review_teacher", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "Pending Teacher" });
    await createTeacher(db, PENDING_TEACHER, "pending-teacher", "submitted");
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query("select public.admin_review_teacher($1, 'approved', null)", [PENDING_TEACHER]),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("approves a teacher, records the reviewer, and writes the audit row in the same call", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "Pending Teacher" });
    await createTeacher(db, PENDING_TEACHER, "pending-teacher", "submitted");
    await actAs(db, "authenticated", PEOPLE.admin);

    await db.query("select public.admin_review_teacher($1, 'approved', null)", [PENDING_TEACHER]);
    await actAsOwner(db);

    const { rows } = await db.query<{
      verification_status: string;
      reviewed_by: string | null;
      reviewed_at: Date | null;
    }>(
      "select verification_status::text, reviewed_by, reviewed_at from public.teacher_profiles where profile_id = $1",
      [PENDING_TEACHER],
    );
    expect(rows[0]?.verification_status).toBe("approved");
    expect(rows[0]?.reviewed_by).toBe(PEOPLE.admin);
    expect(rows[0]?.reviewed_at).toBeInstanceOf(Date);

    // Approval is what makes the person a teacher, so the app's role checks depend on it.
    const role = await db.query<{ role: string }>(
      "select role::text from public.profiles where id = $1",
      [PENDING_TEACHER],
    );
    expect(role.rows[0]?.role).toBe("teacher");

    const audit = await auditRows();
    expect(audit).toEqual([
      { actor_id: PEOPLE.admin, action: "teacher.review", to_status: "approved" },
    ]);
  });

  it("requires a reason to reject and stores it", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "Pending Teacher" });
    await createTeacher(db, PENDING_TEACHER, "pending-teacher", "submitted");
    await actAs(db, "authenticated", PEOPLE.admin);

    const withoutReason = await captureSqlState(db, () =>
      db.query("select public.admin_review_teacher($1, 'rejected', '   ')", [PENDING_TEACHER]),
    );
    await db.query(
      "select public.admin_review_teacher($1, 'rejected', 'Credentials not verified')",
      [PENDING_TEACHER],
    );
    await actAsOwner(db);

    const { rows } = await db.query<{ rejection_reason: string | null }>(
      "select rejection_reason from public.teacher_profiles where profile_id = $1",
      [PENDING_TEACHER],
    );
    expect(withoutReason).toBe(INVALID_PARAMETER);
    expect(rows[0]?.rejection_reason).toBe("Credentials not verified");
  });

  it("rejects a decision outside approved, rejected and suspended", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "Pending Teacher" });
    await createTeacher(db, PENDING_TEACHER, "pending-teacher", "submitted");
    await actAs(db, "authenticated", PEOPLE.admin);

    const state = await captureSqlState(db, () =>
      db.query("select public.admin_review_teacher($1, 'submitted', null)", [PENDING_TEACHER]),
    );
    await actAsOwner(db);

    expect(state).toBe(INVALID_PARAMETER);
  });

  it("reports a missing teacher", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.admin);

    const state = await captureSqlState(db, () =>
      db.query("select public.admin_review_teacher($1, 'approved', null)", [
        "99999999-0000-4000-8000-000000000000",
      ]),
    );
    await actAsOwner(db);

    expect(state).toBe(NO_DATA_FOUND);
  });

  it("lets an admin read the audit log, and hides it from everyone else", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "Pending Teacher" });
    await createTeacher(db, PENDING_TEACHER, "pending-teacher", "submitted");
    await actAs(db, "authenticated", PEOPLE.admin);
    await db.query("select public.admin_review_teacher($1, 'approved', null)", [PENDING_TEACHER]);

    const adminView = await db.query<{ id: string }>("select id from public.admin_audit_log");
    await actAs(db, "authenticated", PEOPLE.learnerA);
    const learnerView = await db.query<{ id: string }>("select id from public.admin_audit_log");
    await actAsOwner(db);

    expect(adminView.rows.length).toBe(1);
    expect(learnerView.rows).toEqual([]);
  });

  it("makes the audit log append-only for every role, including the owner", async () => {
    const db = getDb();
    await createWorld(db);
    await createAuthUser(db, PENDING_TEACHER, { fullName: "Pending Teacher" });
    await createTeacher(db, PENDING_TEACHER, "pending-teacher", "submitted");
    await actAs(db, "authenticated", PEOPLE.admin);
    await db.query("select public.admin_review_teacher($1, 'approved', null)", [PENDING_TEACHER]);
    await actAsOwner(db);

    const updateState = await captureSqlState(db, () =>
      db.query("update public.admin_audit_log set action = 'x'"),
    );
    const deleteState = await captureSqlState(db, () =>
      db.query("delete from public.admin_audit_log"),
    );
    const truncateState = await captureSqlState(db, () =>
      db.query("truncate public.admin_audit_log"),
    );

    expect(updateState).toBe(PERMISSION_DENIED);
    expect(deleteState).toBe(PERMISSION_DENIED);
    expect(truncateState).toBe(PERMISSION_DENIED);
  });

  it("denies an admin writing an audit row under someone else's actor id", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.admin);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.admin_audit_log (actor_id, action, target_type) values ($1, 'spoof', 'profile')",
        [PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });
});

describe("course publishing and lessons", () => {
  it("lets a teacher save a draft and request review, but not publish", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const draft = await captureSqlState(db, () =>
      db.query(
        "insert into public.courses (teacher_id, slug, title, description, price_minor, currency) values ($1, 'mine', 'Mine', '', 0, 'USD')",
        [PEOPLE.teacherT],
      ),
    );
    const review = await captureSqlState(db, () =>
      db.query("update public.courses set status = 'review' where slug = 'mine'"),
    );
    const publish = await captureSqlState(db, () =>
      db.query("update public.courses set status = 'published' where slug = 'mine'"),
    );
    await actAsOwner(db);

    expect(draft).toBeUndefined();
    expect(review).toBeUndefined();
    expect(publish).toBe(PERMISSION_DENIED);
  });

  it("lets trusted server code (service role) publish a course", async () => {
    const db = getDb();
    await createWorld(db);
    await insertCourse(PEOPLE.teacherT, "server-published", "review");

    const state = await captureSqlState(db, () =>
      db.query("update public.courses set status = 'published' where slug = 'server-published'"),
    );

    expect(state).toBeUndefined();
  });

  it("denies a teacher creating a course under another teacher's id", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.courses (teacher_id, slug, title, description, price_minor, currency) values ($1, 'theirs', 'Theirs', '', 0, 'USD')",
        [PEOPLE.teacherU],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("lets an admin read a draft course owned by a teacher", async () => {
    const db = getDb();
    await createWorld(db);
    await insertCourse(PEOPLE.teacherT, "draft-for-review");
    await actAs(db, "authenticated", PEOPLE.admin);

    const { rows } = await db.query<{ slug: string }>("select slug from public.courses");
    await actAsOwner(db);

    expect(rows).toEqual([{ slug: "draft-for-review" }]);
  });

  it("lets a teacher manage their own lessons and blocks lessons on another teacher's course", async () => {
    const db = getDb();
    await createWorld(db);
    const ownCourse = await insertCourse(PEOPLE.teacherT, "own-course");
    const otherCourse = await insertCourse(PEOPLE.teacherU, "other-course");
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const own = await captureSqlState(db, () =>
      db.query(
        "insert into public.course_lessons (course_id, position, title) values ($1, 0, 'Lesson')",
        [ownCourse],
      ),
    );
    const other = await captureSqlState(db, () =>
      db.query(
        "insert into public.course_lessons (course_id, position, title) values ($1, 0, 'Lesson')",
        [otherCourse],
      ),
    );
    await actAsOwner(db);

    expect(own).toBeUndefined();
    expect(other).toBe(PERMISSION_DENIED);
  });

  it("enforces unique lesson positions within a course", async () => {
    const db = getDb();
    await createWorld(db);
    const course = await insertCourse(PEOPLE.teacherT, "positions");
    await db.query(
      "insert into public.course_lessons (course_id, position, title) values ($1, 0, 'First')",
      [course],
    );

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.course_lessons (course_id, position, title) values ($1, 0, 'Duplicate')",
        [course],
      ),
    );

    expect(state).toBe(UNIQUE_VIOLATION);
  });
});

describe("reviews", () => {
  it("lets a learner review a completed booking they made", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "completed",
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.reviews (booking_id, learner_id, teacher_id, rating, body) values ($1, $2, $3, 4, 'Good')",
        [bookingId, PEOPLE.learnerA, PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(state).toBeUndefined();
  });

  it("denies a review before the booking is completed", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.reviews (booking_id, learner_id, teacher_id, rating) values ($1, $2, $3, 4)",
        [bookingId, PEOPLE.learnerA, PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies a learner reviewing someone else's booking", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "completed",
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.reviews (booking_id, learner_id, teacher_id, rating) values ($1, $2, $3, 2)",
        [bookingId, PEOPLE.learnerB, PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies setting is_visible on a new review", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "completed",
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.reviews (booking_id, learner_id, teacher_id, rating, is_visible) values ($1, $2, $3, 5, true)",
        [bookingId, PEOPLE.learnerA, PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("makes posted reviews immutable for the learner", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "completed",
      ...SLOTS.first,
    });
    await db.query(
      "insert into public.reviews (booking_id, learner_id, teacher_id, rating) values ($1, $2, $3, 3)",
      [bookingId, PEOPLE.learnerA, PEOPLE.teacherT],
    );
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () => db.query("update public.reviews set rating = 5"));
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("enforces one review per booking and a rating between 1 and 5", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "completed",
      ...SLOTS.first,
    });
    await db.query(
      "insert into public.reviews (booking_id, learner_id, teacher_id, rating) values ($1, $2, $3, 3)",
      [bookingId, PEOPLE.learnerA, PEOPLE.teacherT],
    );

    const duplicate = await captureSqlState(db, () =>
      db.query(
        "insert into public.reviews (booking_id, learner_id, teacher_id, rating) values ($1, $2, $3, 4)",
        [bookingId, PEOPLE.learnerA, PEOPLE.teacherT],
      ),
    );
    const otherBookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerB,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      status: "completed",
      ...SLOTS.adjacent,
    });
    const outOfRange = await captureSqlState(db, () =>
      db.query(
        "insert into public.reviews (booking_id, learner_id, teacher_id, rating) values ($1, $2, $3, 6)",
        [otherBookingId, PEOPLE.learnerB, PEOPLE.teacherT],
      ),
    );

    expect(duplicate).toBe(UNIQUE_VIOLATION);
    expect(outOfRange).toBe(CHECK_VIOLATION);
  });
});

describe("lesson notes and practice sessions", () => {
  it("lets a teacher write a note that only the matching learner can read", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.teacherT);
    const written = await captureSqlState(db, () =>
      db.query(
        "insert into public.lesson_notes (booking_id, teacher_id, learner_id, body) values ($1, $2, $3, 'Practise the taal')",
        [bookingId, PEOPLE.teacherT, PEOPLE.learnerA],
      ),
    );
    await actAs(db, "authenticated", PEOPLE.learnerA);
    const learnerRead = await db.query<{ body: string }>("select body from public.lesson_notes");
    await actAs(db, "authenticated", PEOPLE.learnerB);
    const otherRead = await db.query<{ body: string }>("select body from public.lesson_notes");
    await actAsOwner(db);

    expect(written).toBeUndefined();
    expect(learnerRead.rows).toEqual([{ body: "Practise the taal" }]);
    expect(otherRead.rows).toEqual([]);
  });

  it("denies a learner writing a lesson note", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.lesson_notes (booking_id, teacher_id, learner_id, body) values ($1, $2, $3, 'Self note')",
        [bookingId, PEOPLE.teacherT, PEOPLE.learnerA],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("rejects a lesson note for a booking that belongs to another teacher", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.teacherU);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.lesson_notes (booking_id, teacher_id, learner_id, body) values ($1, $2, $3, 'Wrong teacher')",
        [bookingId, PEOPLE.teacherU, PEOPLE.learnerA],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("lets a learner log their own practice session and blocks logging for someone else", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const own = await captureSqlState(db, () =>
      db.query(
        "insert into public.practice_sessions (learner_id, started_at, duration_seconds, taal_slug, tempo_bpm) values ($1, now(), 600, 'teentaal', 90)",
        [PEOPLE.learnerA],
      ),
    );
    const forSomeoneElse = await captureSqlState(db, () =>
      db.query(
        "insert into public.practice_sessions (learner_id, started_at, duration_seconds, taal_slug, tempo_bpm) values ($1, now(), 60, 'teentaal', 90)",
        [PEOPLE.learnerB],
      ),
    );
    await actAsOwner(db);

    expect(own).toBeUndefined();
    expect(forSomeoneElse).toBe(PERMISSION_DENIED);
  });

  it("rejects a practice session tied to another learner's booking, and an out-of-range tempo", async () => {
    const db = getDb();
    const world = await createWorld(db);
    const bookingId = await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const otherBooking = await captureSqlState(db, () =>
      db.query(
        "insert into public.practice_sessions (learner_id, booking_id, started_at, duration_seconds, taal_slug, tempo_bpm) values ($1, $2, now(), 60, 'teentaal', 90)",
        [PEOPLE.learnerB, bookingId],
      ),
    );
    const tempo = await captureSqlState(db, () =>
      db.query(
        "insert into public.practice_sessions (learner_id, started_at, duration_seconds, taal_slug, tempo_bpm) values ($1, now(), 60, 'teentaal', 19)",
        [PEOPLE.learnerB],
      ),
    );
    await actAsOwner(db);

    expect(otherBooking).toBe(FOREIGN_KEY_VIOLATION);
    expect(tempo).toBe(CHECK_VIOLATION);
  });
});

describe("reports, notifications and settings", () => {
  it("lets a user report content but not set its resolution fields", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const report = await captureSqlState(db, () =>
      db.query(
        "insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'profile', $2, 'Abusive')",
        [PEOPLE.learnerA, PEOPLE.teacherT],
      ),
    );
    const resolved = await captureSqlState(db, () =>
      db.query(
        "insert into public.reports (reporter_id, target_type, target_id, reason, status, resolved_at) values ($1, 'profile', $2, 'Pre-closed', 'resolved', now())",
        [PEOPLE.learnerA, PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(report).toBeUndefined();
    expect(resolved).toBe(PERMISSION_DENIED);
  });

  it("hides other people's reports from a reporter and shows them to admins", async () => {
    const db = getDb();
    await createWorld(db);
    await db.query(
      "insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'profile', $2, 'Spam')",
      [PEOPLE.learnerA, PEOPLE.teacherT],
    );
    await actAs(db, "authenticated", PEOPLE.learnerB);
    const reporterView = await db.query<{ id: string }>("select id from public.reports");
    await actAs(db, "authenticated", PEOPLE.admin);
    const adminView = await db.query<{ id: string }>("select id from public.reports");
    await actAsOwner(db);

    expect(reporterView.rows).toEqual([]);
    expect(adminView.rows.length).toBe(1);
  });

  it("rejects an unknown report target type", async () => {
    const db = getDb();
    await createWorld(db);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'booking', $2, 'Nope')",
        [PEOPLE.learnerA, PEOPLE.teacherT],
      ),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });

  it("lets a user mark their own notification as read, and nothing else", async () => {
    const db = getDb();
    await createWorld(db);
    await db.query(
      "insert into public.notifications (user_id, type, payload) values ($1, 'booking.confirmed', '{}')",
      [PEOPLE.learnerA],
    );
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const markRead = await captureSqlState(db, () =>
      db.query("update public.notifications set read_at = now()"),
    );
    const changeType = await captureSqlState(db, () =>
      db.query("update public.notifications set type = 'x'"),
    );
    await actAsOwner(db);

    expect(markRead).toBeUndefined();
    expect(changeType).toBe(PERMISSION_DENIED);
  });

  it("shows platform settings to admins only, and keeps the singleton row", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.admin);
    const adminView = await db.query<{ platform_fee_bps: number }>(
      "select platform_fee_bps from public.platform_settings",
    );
    await actAs(db, "authenticated", PEOPLE.learnerA);
    const learnerView = await db.query<{ platform_fee_bps: number }>(
      "select platform_fee_bps from public.platform_settings",
    );
    await actAsOwner(db);
    const second = await captureSqlState(db, () =>
      db.query("insert into public.platform_settings (singleton) values (false)"),
    );

    expect(adminView.rows).toEqual([{ platform_fee_bps: 0 }]);
    expect(learnerView.rows).toEqual([]);
    expect(second).toBe(CHECK_VIOLATION);
  });
});
