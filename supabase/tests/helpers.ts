import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

export type ClientRole = "anon" | "authenticated";
export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "refunded"
  | "expired";
export type VerificationStatus = "submitted" | "approved" | "rejected" | "suspended";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));
const SEED_FILE = fileURLToPath(new URL("../seed.sql", import.meta.url));

// Stand-in for Supabase's auth schema. It provides only what the migrations touch:
// auth.users (the trigger target) and auth.uid() (read from the JWT subject claim).
const AUTH_STUB_SQL = `
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  create role anon nologin;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create role authenticated nologin;
exception
  when duplicate_object then null;
end
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;

/** Fixed user ids used across the suite. */
export const PEOPLE = {
  learnerA: "10000000-0000-4000-8000-000000000001",
  learnerB: "10000000-0000-4000-8000-000000000002",
  teacherT: "20000000-0000-4000-8000-000000000001",
  teacherU: "20000000-0000-4000-8000-000000000002",
  teacherPending: "20000000-0000-4000-8000-000000000003",
  admin: "30000000-0000-4000-8000-000000000001",
} as const;

/** Far-future slots so the "starts in the future" trigger never depends on the wall clock. */
export const SLOTS = {
  first: { startsAt: "2099-06-01T10:00:00Z", endsAt: "2099-06-01T11:00:00Z" },
  overlapping: { startsAt: "2099-06-01T10:30:00Z", endsAt: "2099-06-01T11:30:00Z" },
  adjacent: { startsAt: "2099-06-01T11:00:00Z", endsAt: "2099-06-01T12:00:00Z" },
} as const;

const HOLD_EXPIRES_AT = "2099-05-31T09:00:00Z";
const CANCELLED_AT = "2099-05-30T09:00:00Z";

/** Reads the migration files in filename order, the same order Supabase applies them. */
export function readMigrations(): Array<{ name: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(`${MIGRATIONS_DIR}/${name}`, "utf8") }));
}

export async function applyMigrations(db: PGlite): Promise<void> {
  for (const migration of readMigrations()) {
    await db.exec(migration.sql);
  }
}

export async function applySeed(db: PGlite): Promise<void> {
  await db.exec(readFileSync(SEED_FILE, "utf8"));
}

/** Creates an in-memory database with the auth stub, every migration and the seed applied. */
export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist, pg_trgm } });
  await db.exec(AUTH_STUB_SQL);
  await applyMigrations(db);
  await applySeed(db);
  return db;
}

/**
 * Registers hooks that give every test a fresh database state. The database is built once
 * per file, and each test runs inside a transaction that is rolled back afterwards.
 * Returns a getter, which must be called inside a test or hook.
 */
export function registerTestDatabase(): () => PGlite {
  let db: PGlite | undefined;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await requireDatabase(db).exec("begin");
  });

  afterEach(async () => {
    await requireDatabase(db).exec("rollback");
  });

  return () => requireDatabase(db);
}

function requireDatabase(db: PGlite | undefined): PGlite {
  if (!db) {
    throw new Error("Test database is not initialised");
  }
  return db;
}

/** Switches the session to a client role and sets the JWT subject that auth.uid() reads. */
export async function actAs(db: PGlite, role: ClientRole, userId?: string): Promise<void> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
}

/** Returns to the privileged session used for fixtures and owner-level checks. */
export async function actAsOwner(db: PGlite): Promise<void> {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

/**
 * SQLSTATE of a PGlite database error, or undefined for anything else. PGlite's DatabaseError is
 * a type-only export at runtime, so this checks the shape instead of using instanceof.
 */
export function sqlStateOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const { code } = error;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

/**
 * Runs a statement that is expected to fail and returns its SQLSTATE. A savepoint keeps the
 * surrounding transaction usable. Returns undefined when the statement succeeds.
 * Errors without a SQLSTATE are rethrown, so unexpected failures are never swallowed.
 */
export async function captureSqlState(
  db: PGlite,
  statement: () => Promise<unknown>,
): Promise<string | undefined> {
  const name = `capture_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.exec(`savepoint ${name}`);
  try {
    await statement();
    await db.exec(`release savepoint ${name}`);
    return undefined;
  } catch (error: unknown) {
    await db.exec(`rollback to savepoint ${name}`);
    await db.exec(`release savepoint ${name}`);
    const state = sqlStateOf(error);
    if (state === undefined) {
      throw error;
    }
    return state;
  }
}

// Fixtures ---------------------------------------------------------------------

export interface AuthUserOptions {
  fullName?: string;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
}

export async function createAuthUser(
  db: PGlite,
  id: string,
  options: AuthUserOptions = {},
): Promise<void> {
  const userMetadata = {
    ...(options.fullName === undefined ? {} : { full_name: options.fullName }),
    ...(options.userMetadata ?? {}),
  };
  await db.query(
    "insert into auth.users (id, raw_user_meta_data, raw_app_meta_data) values ($1, $2::jsonb, $3::jsonb)",
    [id, JSON.stringify(userMetadata), JSON.stringify(options.appMetadata ?? {})],
  );
}

export async function setProfileRole(
  db: PGlite,
  id: string,
  role: "learner" | "teacher" | "admin",
): Promise<void> {
  await db.query("update public.profiles set role = $2::public.user_role where id = $1", [
    id,
    role,
  ]);
}

export async function createTeacher(
  db: PGlite,
  profileId: string,
  slug: string,
  status: VerificationStatus = "approved",
): Promise<void> {
  const reviewedAt = status === "submitted" ? null : new Date().toISOString();
  const rejectionReason = status === "rejected" || status === "suspended" ? "Test reason" : null;
  await db.query(
    `insert into public.teacher_profiles
       (profile_id, slug, headline, verification_status, reviewed_at, rejection_reason)
     values ($1, $2, 'Test teacher', $3::public.verification_status, $4, $5)`,
    [profileId, slug, status, reviewedAt, rejectionReason],
  );
}

export async function createOffering(
  db: PGlite,
  teacherId: string,
  durationMinutes = 60,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.lesson_offerings (teacher_id, title, duration_minutes, price_minor, currency)
     values ($1, 'Test lesson', $2, 5000, 'USD')
     returning id`,
    [teacherId, durationMinutes],
  );
  return requireRow(rows).id;
}

export interface BookingInput {
  learnerId: string;
  teacherId: string;
  offeringId: string;
  startsAt: string;
  endsAt: string;
  status?: BookingStatus;
  idempotencyKey?: string;
}

/** Inserts a booking as the owner, so the insert trigger and constraints still run. */
export async function createBooking(db: PGlite, input: BookingInput): Promise<string> {
  const status = input.status ?? "confirmed";
  const { rows } = await db.query<{ id: string }>(
    `insert into public.bookings (
       learner_id, teacher_id, offering_id, starts_at, ends_at, status,
       price_minor, currency, idempotency_key, hold_expires_at, cancelled_at
     ) values (
       $1, $2, $3, $4, $5, $6::public.booking_status,
       5000, 'USD', $7, $8, $9
     )
     returning id`,
    [
      input.learnerId,
      input.teacherId,
      input.offeringId,
      input.startsAt,
      input.endsAt,
      status,
      input.idempotencyKey ?? crypto.randomUUID(),
      status === "pending_payment" ? HOLD_EXPIRES_AT : null,
      status === "cancelled" ? CANCELLED_AT : null,
    ],
  );
  return requireRow(rows).id;
}

/** Standard world: two learners, two approved teachers with 60-minute offerings, and an admin. */
export interface World {
  offeringT: string;
  offeringU: string;
}

export async function createWorld(db: PGlite): Promise<World> {
  await createAuthUser(db, PEOPLE.learnerA, { fullName: "Asha Learner" });
  await createAuthUser(db, PEOPLE.learnerB, { fullName: "Bilal Learner" });
  await createAuthUser(db, PEOPLE.teacherT, { fullName: "Teacher T" });
  await createAuthUser(db, PEOPLE.teacherU, { fullName: "Teacher U" });
  await createAuthUser(db, PEOPLE.admin, { fullName: "Admin" });
  await setProfileRole(db, PEOPLE.admin, "admin");

  await createTeacher(db, PEOPLE.teacherT, "teacher-t", "approved");
  await createTeacher(db, PEOPLE.teacherU, "teacher-u", "approved");

  return {
    offeringT: await createOffering(db, PEOPLE.teacherT),
    offeringU: await createOffering(db, PEOPLE.teacherU),
  };
}

function requireRow<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("Expected a row but the query returned none");
  }
  return row;
}
