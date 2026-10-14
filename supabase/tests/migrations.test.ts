import { describe, expect, it } from "vitest";

import { applyMigrations, applySeed, readMigrations, registerTestDatabase } from "./helpers";

const getDb = registerTestDatabase();

describe("migrations", () => {
  it("are applied in the documented filename order", () => {
    const names = readMigrations().map((migration) => migration.name);

    expect(names).toEqual([
      "20261014120000_schema.sql",
      "20261014120100_security.sql",
      "20261014120200_triggers.sql",
      "20261014120300_catalogue.sql",
    ]);
  });

  it("can be re-applied without errors", async () => {
    const db = getDb();

    await expect(applyMigrations(db)).resolves.toBeUndefined();
    await expect(applySeed(db)).resolves.toBeUndefined();
  });

  it("seeds the instrument and style catalogue exactly once", async () => {
    const db = getDb();

    await applySeed(db);

    const instruments = await db.query<{ count: number }>(
      "select count(*)::int as count from public.instruments",
    );
    const styles = await db.query<{ count: number }>(
      "select count(*)::int as count from public.music_styles",
    );

    expect(instruments.rows[0]?.count).toBe(9);
    expect(styles.rows[0]?.count).toBe(6);
  });

  it("creates the booking double-booking exclusion constraint", async () => {
    const db = getDb();

    const { rows } = await db.query<{ contype: string }>(
      `select contype from pg_constraint
       where conname = 'bookings_no_overlap' and conrelid = 'public.bookings'::regclass`,
    );

    expect(rows[0]?.contype).toBe("x");
  });

  it("creates trigram indexes for teacher search", async () => {
    const db = getDb();

    const { rows } = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = 'public'
         and indexname in ('profiles_display_name_trgm_idx', 'teacher_profiles_bio_trgm_idx')
       order by indexname`,
    );

    expect(rows.map((row) => row.indexname)).toEqual([
      "profiles_display_name_trgm_idx",
      "teacher_profiles_bio_trgm_idx",
    ]);
  });

  it("names the booking and conversation foreign keys with Postgres defaults", async () => {
    const db = getDb();

    const { rows } = await db.query<{ conrelid: string; conname: string }>(
      `select c.conrelid::regclass::text as conrelid, c.conname
       from pg_constraint as c
       where c.contype = 'f'
         and c.conrelid in ('public.bookings'::regclass, 'public.conversations'::regclass)
         and c.conkey in (array[2]::smallint[], array[3]::smallint[])
       order by 1, 2`,
    );

    expect(rows).toEqual([
      { conrelid: "bookings", conname: "bookings_learner_id_fkey" },
      { conrelid: "bookings", conname: "bookings_teacher_id_fkey" },
      { conrelid: "conversations", conname: "conversations_learner_id_fkey" },
      { conrelid: "conversations", conname: "conversations_teacher_id_fkey" },
    ]);
  });
});
