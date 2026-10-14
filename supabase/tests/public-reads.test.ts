import { describe, expect, it } from "vitest";

import {
  PEOPLE,
  SLOTS,
  actAs,
  actAsOwner,
  captureSqlState,
  createAuthUser,
  createBooking,
  createOffering,
  createTeacher,
  createWorld,
  registerTestDatabase,
} from "./helpers";

const getDb = registerTestDatabase();

const PERMISSION_DENIED = "42501";

/**
 * Public catalogue plus one approved teacher, one pending teacher, a published and a draft course,
 * an active and an inactive offering, and one visible and one hidden review.
 */
async function seedPublicWorld(): Promise<void> {
  const db = getDb();
  const world = await createWorld(db);

  await createAuthUser(db, PEOPLE.teacherPending, { fullName: "Pending Teacher" });
  await createTeacher(db, PEOPLE.teacherPending, "teacher-pending", "submitted");
  await createOffering(db, PEOPLE.teacherPending);

  await db.query(
    `insert into public.teacher_instruments (teacher_id, instrument_id)
     select $1, id from public.instruments where slug = 'tabla'`,
    [PEOPLE.teacherT],
  );
  await db.query(
    `insert into public.teacher_instruments (teacher_id, instrument_id)
     select $1, id from public.instruments where slug = 'vocal'`,
    [PEOPLE.teacherPending],
  );
  await db.query(
    `insert into public.teacher_styles (teacher_id, music_style_id)
     select $1, id from public.music_styles where slug = 'qawwali'`,
    [PEOPLE.teacherT],
  );

  await db.query("update public.lesson_offerings set is_active = false where id = $1", [
    world.offeringU,
  ]);

  await db.query(
    `insert into public.courses (teacher_id, slug, title, description, price_minor, currency, status)
     values
       ($1, 'intro-course', 'Intro course', 'Public course', 0, 'USD', 'published'),
       ($1, 'draft-course', 'Draft course', 'Not public', 0, 'USD', 'draft'),
       ($2, 'pending-course', 'Pending teacher course', 'Hidden', 0, 'USD', 'published')`,
    [PEOPLE.teacherT, PEOPLE.teacherPending],
  );
  await db.query(
    `insert into public.course_lessons (course_id, position, title)
     select c.id, 0, 'Lesson 1' from public.courses as c where c.slug in ('intro-course', 'draft-course')`,
  );

  const completedVisible = await createBooking(db, {
    learnerId: PEOPLE.learnerA,
    teacherId: PEOPLE.teacherT,
    offeringId: world.offeringT,
    status: "completed",
    ...SLOTS.first,
  });
  const completedHidden = await createBooking(db, {
    learnerId: PEOPLE.learnerB,
    teacherId: PEOPLE.teacherT,
    offeringId: world.offeringT,
    status: "completed",
    ...SLOTS.adjacent,
  });
  await db.query(
    `insert into public.reviews (booking_id, learner_id, teacher_id, rating, body, is_visible)
     values ($1, $2, $3, 5, 'Great lesson', true),
            ($4, $5, $3, 1, 'Hidden review', false)`,
    [completedVisible, PEOPLE.learnerA, PEOPLE.teacherT, completedHidden, PEOPLE.learnerB],
  );
}

describe("anonymous public reads", () => {
  it("lists only approved teachers through the teacher and profile embedding", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const { rows } = await db.query<{ slug: string; display_name: string }>(
      `select tp.slug, p.display_name
       from public.teacher_profiles as tp
       join public.profiles as p on p.id = tp.profile_id
       order by tp.slug`,
    );
    await actAsOwner(db);

    expect(rows).toEqual([
      { slug: "teacher-t", display_name: "Teacher T" },
      { slug: "teacher-u", display_name: "Teacher U" },
    ]);
  });

  it("returns only active offerings from approved teachers, with the teacher embedded", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const { rows } = await db.query<{ title: string; slug: string }>(
      `select o.title, tp.slug
       from public.lesson_offerings as o
       join public.teacher_profiles as tp on tp.profile_id = o.teacher_id
       where o.is_active`,
    );
    await actAsOwner(db);

    expect(rows).toEqual([{ title: "Test lesson", slug: "teacher-t" }]);
  });

  it("shows instrument and style tags only for approved teachers", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const instruments = await db.query<{ slug: string; teacher_slug: string }>(
      `select i.slug, tp.slug as teacher_slug
       from public.teacher_instruments as ti
       join public.instruments as i on i.id = ti.instrument_id
       join public.teacher_profiles as tp on tp.profile_id = ti.teacher_id`,
    );
    const styles = await db.query<{ slug: string }>(
      `select ms.slug
       from public.teacher_styles as ts
       join public.music_styles as ms on ms.id = ts.music_style_id`,
    );
    await actAsOwner(db);

    expect(instruments.rows).toEqual([{ slug: "tabla", teacher_slug: "teacher-t" }]);
    expect(styles.rows).toEqual([{ slug: "qawwali" }]);
  });

  it("returns published courses of approved teachers and their lessons, and nothing else", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const courses = await db.query<{ slug: string }>(
      "select slug from public.courses order by slug",
    );
    const lessons = await db.query<{ title: string }>("select title from public.course_lessons");
    await actAsOwner(db);

    expect(courses.rows).toEqual([{ slug: "intro-course" }]);
    expect(lessons.rows).toEqual([{ title: "Lesson 1" }]);
  });

  it("returns only visible reviews", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const { rows } = await db.query<{ body: string }>("select body from public.reviews");
    await actAsOwner(db);

    expect(rows).toEqual([{ body: "Great lesson" }]);
  });

  it("reads profile identity columns for approved teachers only", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.profiles order by 1",
    );
    await actAsOwner(db);

    expect(rows).toEqual([{ display_name: "Teacher T" }, { display_name: "Teacher U" }]);
  });

  it("hides the role column from anon, even on an approved teacher's profile", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const state = await captureSqlState(db, () => db.query("select role from public.profiles"));
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("hides a teacher's profile once it is soft-deleted", async () => {
    const db = getDb();
    await seedPublicWorld();
    await db.query("update public.profiles set deleted_at = now() where id = $1", [
      PEOPLE.teacherU,
    ]);
    await actAs(db, "anon");

    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.profiles",
    );
    await actAsOwner(db);

    expect(rows).toEqual([{ display_name: "Teacher T" }]);
  });

  it("denies anon any access to the profile of a learner", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "anon");

    const { rows } = await db.query<{ id: string }>(
      "select id from public.profiles where id = $1",
      [PEOPLE.learnerA],
    );
    await actAsOwner(db);

    expect(rows).toEqual([]);
  });
});

describe("counterpart profile reads", () => {
  it("lets a teacher read the display name of a learner they have a booking with", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [PEOPLE.learnerA],
    );
    await actAsOwner(db);

    expect(rows).toEqual([{ display_name: "Asha Learner" }]);
  });

  it("lets a learner read the teacher they have a booking with", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [PEOPLE.teacherT],
    );
    await actAsOwner(db);

    expect(rows).toEqual([{ display_name: "Teacher T" }]);
  });

  it("lets a teacher read a learner they share a conversation with, even without a booking", async () => {
    const db = getDb();
    await seedPublicWorld();
    await db.query("insert into public.conversations (learner_id, teacher_id) values ($1, $2)", [
      PEOPLE.learnerB,
      PEOPLE.teacherU,
    ]);
    await actAs(db, "authenticated", PEOPLE.teacherU);

    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [PEOPLE.learnerB],
    );
    await actAsOwner(db);

    expect(rows).toEqual([{ display_name: "Bilal Learner" }]);
  });

  it("hides a learner's profile from a teacher with no booking or conversation", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "authenticated", PEOPLE.teacherU);

    const { rows } = await db.query<{ id: string }>(
      "select id from public.profiles where id = $1",
      [PEOPLE.learnerA],
    );
    await actAsOwner(db);

    expect(rows).toEqual([]);
  });

  it("hides an unrelated learner's profile from another learner", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const { rows } = await db.query<{ id: string }>(
      "select id from public.profiles where id = $1",
      [PEOPLE.learnerA],
    );
    await actAsOwner(db);

    expect(rows).toEqual([]);
  });

  it("still lets a learner read their own profile row", async () => {
    const db = getDb();
    await seedPublicWorld();
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const { rows } = await db.query<{ id: string }>(
      "select id from public.profiles where id = $1",
      [PEOPLE.learnerB],
    );
    await actAsOwner(db);

    expect(rows).toEqual([{ id: PEOPLE.learnerB }]);
  });
});

describe("read grants match read policies", () => {
  it("grants anon select on exactly the tables the public pages embed", async () => {
    const db = getDb();

    const { rows } = await db.query<{ relname: string }>(
      `select c.relname
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and (has_table_privilege('anon', c.oid, 'SELECT')
              or has_any_column_privilege('anon', c.oid, 'SELECT'))
       order by c.relname`,
    );

    expect(rows.map((row) => row.relname)).toEqual([
      "course_lessons",
      "courses",
      "instruments",
      "lesson_offerings",
      "music_styles",
      "profiles",
      "reviews",
      "teacher_instruments",
      "teacher_profiles",
      "teacher_styles",
    ]);
  });

  it("gives every table that anon can select a select policy for anon, and no other", async () => {
    const db = getDb();

    const { rows } = await db.query<{ tablename: string }>(
      `select distinct p.tablename
       from pg_policies as p
       where p.schemaname = 'public'
         and p.cmd in ('SELECT', 'ALL')
         and 'anon' = any (p.roles::text[])
       order by p.tablename`,
    );

    expect(rows.map((row) => row.tablename)).toEqual([
      "course_lessons",
      "courses",
      "instruments",
      "lesson_offerings",
      "music_styles",
      "profiles",
      "reviews",
      "teacher_instruments",
      "teacher_profiles",
      "teacher_styles",
    ]);
  });

  it("has no table where authenticated can read but no select policy applies", async () => {
    const db = getDb();

    const { rows } = await db.query<{ relname: string }>(
      `select c.relname
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and (has_table_privilege('authenticated', c.oid, 'SELECT')
              or has_any_column_privilege('authenticated', c.oid, 'SELECT'))
         and not exists (
           select 1
           from pg_policies as p
           where p.schemaname = 'public'
             and p.tablename = c.relname
             and p.cmd in ('SELECT', 'ALL')
             and ('authenticated' = any (p.roles::text[]) or 'public' = any (p.roles::text[]))
         )
       order by c.relname`,
    );

    expect(rows).toEqual([]);
  });
});
