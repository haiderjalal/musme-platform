import { describe, expect, it } from "vitest";

import {
  PEOPLE,
  SLOTS,
  actAs,
  actAsOwner,
  captureSqlState,
  createAuthUser,
  createBooking,
  createWorld,
  registerTestDatabase,
} from "./helpers";

const getDb = registerTestDatabase();

const PERMISSION_DENIED = "42501";

describe("auth user profile trigger", () => {
  it("creates a learner profile even when user metadata claims the admin role", async () => {
    const db = getDb();
    const id = "50000000-0000-4000-8000-000000000001";

    await createAuthUser(db, id, {
      userMetadata: { role: "admin" },
      appMetadata: { role: "admin" },
    });

    const { rows } = await db.query<{ role: string }>(
      "select role::text from public.profiles where id = $1",
      [id],
    );
    expect(rows[0]?.role).toBe("learner");
  });

  it("takes the display name from full_name and truncates it to 80 characters", async () => {
    const db = getDb();
    const id = "50000000-0000-4000-8000-000000000002";

    await createAuthUser(db, id, { fullName: "x".repeat(120) });

    const { rows } = await db.query<{ length: number }>(
      "select char_length(display_name)::int as length from public.profiles where id = $1",
      [id],
    );
    expect(rows[0]?.length).toBe(80);
  });

  it("leaves the display name empty when full_name is blank", async () => {
    const db = getDb();
    const id = "50000000-0000-4000-8000-000000000003";

    await createAuthUser(db, id, { fullName: "   " });

    const { rows } = await db.query<{ display_name: string | null }>(
      "select display_name from public.profiles where id = $1",
      [id],
    );
    expect(rows[0]?.display_name).toBeNull();
  });
});

describe("direct write denial for authenticated users", () => {
  it("prevents a learner from changing their own role", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query("update public.profiles set role = 'admin' where id = $1", [PEOPLE.learnerA]),
    );

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("lets a learner update their display name", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    await db.query("update public.profiles set display_name = 'Asha' where id = $1", [
      PEOPLE.learnerA,
    ]);
    await actAsOwner(db);

    const { rows } = await db.query<{ display_name: string; role: string }>(
      "select display_name, role::text from public.profiles where id = $1",
      [PEOPLE.learnerA],
    );
    expect(rows[0]).toEqual({ display_name: "Asha", role: "learner" });
  });

  it("silently affects no rows when a learner updates another profile", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const result = await db.query(
      "update public.profiles set display_name = 'Hacked' where id = $1",
      [PEOPLE.learnerB],
    );
    await actAsOwner(db);

    expect(result.affectedRows).toBe(0);
  });

  it("prevents clients from inserting profile rows", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query("insert into public.profiles (id) values ($1)", [
        "50000000-0000-4000-8000-0000000000aa",
      ]),
    );

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("prevents a learner from inserting bookings", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query(
        `insert into public.bookings
           (learner_id, teacher_id, offering_id, starts_at, ends_at, status, price_minor, currency, idempotency_key, hold_expires_at)
         values ($1, $2, $3, $4, $5, 'pending_payment', 5000, 'USD', gen_random_uuid(), now() + interval '15 minutes')`,
        [
          PEOPLE.learnerA,
          PEOPLE.teacherT,
          world.offeringT,
          SLOTS.first.startsAt,
          SLOTS.first.endsAt,
        ],
      ),
    );

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("prevents a learner from changing a booking's status", async () => {
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
        "update public.bookings set status = 'cancelled', cancelled_at = now() where id = $1",
        [bookingId],
      ),
    );

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("prevents a teacher from setting their own verification status", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query(
        "update public.teacher_profiles set verification_status = 'approved' where profile_id = $1",
        [PEOPLE.teacherT],
      ),
    );

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("prevents a teacher from changing their public slug", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query("update public.teacher_profiles set slug = 'new-slug' where profile_id = $1", [
        PEOPLE.teacherT,
      ]),
    );

    expect(state).toBe(PERMISSION_DENIED);
  });
});

describe("anon and webhook access", () => {
  it("denies anon any column of profiles beyond the public identity list", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "anon");

    const state = await captureSqlState(db, () =>
      db.query("select created_at from public.profiles"),
    );

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies anon and authenticated any access to webhook_events", async () => {
    const db = getDb();
    await createWorld(db);

    await actAs(db, "anon");
    const anonState = await captureSqlState(db, () =>
      db.query("select id from public.webhook_events"),
    );
    await actAs(db, "authenticated", PEOPLE.learnerA);
    const authState = await captureSqlState(db, () =>
      db.query("select id from public.webhook_events"),
    );
    await actAsOwner(db);

    expect(anonState).toBe(PERMISSION_DENIED);
    expect(authState).toBe(PERMISSION_DENIED);
  });
});

describe("schema privilege model", () => {
  it("enables row level security on every table in public", async () => {
    const db = getDb();

    const { rows } = await db.query<{ relname: string }>(
      `select c.relname
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and not c.relrowsecurity
       order by c.relname`,
    );

    expect(rows.map((row) => row.relname)).toEqual([]);
  });

  it("gives anon no write privileges on any public table", async () => {
    const db = getDb();

    const { rows } = await db.query<{ table_name: string; privilege: string }>(
      `select c.relname as table_name, p.privilege
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
       cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
       where n.nspname = 'public'
         and c.relkind = 'r'
         and has_table_privilege('anon', c.oid, p.privilege)`,
    );

    expect(rows).toEqual([]);
  });

  it.each([
    ["bookings", "INSERT"],
    ["bookings", "UPDATE"],
    ["bookings", "DELETE"],
    ["payments", "INSERT"],
    ["payments", "UPDATE"],
    ["payments", "DELETE"],
    ["platform_settings", "INSERT"],
    ["platform_settings", "UPDATE"],
    ["webhook_events", "SELECT"],
    ["admin_audit_log", "UPDATE"],
    ["admin_audit_log", "DELETE"],
    ["messages", "UPDATE"],
    ["messages", "DELETE"],
    ["reviews", "UPDATE"],
    ["reviews", "DELETE"],
    ["profiles", "INSERT"],
    ["profiles", "DELETE"],
  ])("denies authenticated %s privilege %s", async (table, privilege) => {
    const db = getDb();

    const { rows } = await db.query<{ granted: boolean }>(
      "select has_table_privilege('authenticated', $1, $2) as granted",
      [`public.${table}`, privilege],
    );

    expect(rows[0]?.granted).toBe(false);
  });

  it.each([
    ["profiles", "role"],
    ["teacher_profiles", "verification_status"],
    ["teacher_profiles", "reviewed_by"],
    ["teacher_profiles", "rejection_reason"],
    ["teacher_profiles", "slug"],
    ["notifications", "user_id"],
    ["reports", "status"],
    ["reviews", "is_visible"],
  ])("denies authenticated update on %s.%s", async (table, column) => {
    const db = getDb();

    const { rows } = await db.query<{ granted: boolean }>(
      "select has_column_privilege('authenticated', $1, $2, 'UPDATE') as granted",
      [`public.${table}`, column],
    );

    expect(rows[0]?.granted).toBe(false);
  });

  it.each([
    ["is_admin()", "authenticated", true],
    ["is_admin()", "anon", false],
    ["is_approved_teacher(uuid)", "anon", true],
    ["has_chat_booking(uuid, uuid)", "anon", false],
    ["teacher_busy_ranges(uuid, timestamptz, timestamptz)", "anon", true],
    ["teacher_busy_ranges(uuid, timestamptz, timestamptz)", "authenticated", true],
    ["admin_review_teacher(uuid, verification_status, text)", "authenticated", true],
    ["admin_review_teacher(uuid, verification_status, text)", "anon", false],
    ["submit_teacher_application()", "authenticated", true],
    ["submit_teacher_application()", "anon", false],
    ["handle_new_user()", "authenticated", false],
  ])("grants EXECUTE on %s to %s = %s", async (signature, role, expected) => {
    const db = getDb();

    const { rows } = await db.query<{ granted: boolean }>(
      "select has_function_privilege($1, 'public.' || $2, 'EXECUTE') as granted",
      [role, signature],
    );

    expect(rows[0]?.granted).toBe(expected);
  });
});
