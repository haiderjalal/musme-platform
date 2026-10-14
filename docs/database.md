# MUSME database

Supabase Postgres schema, row level security, grants and database-level business rules for the Phase 1 MVP. The source of truth is `docs/product-plan.md`, sections 10 (data model) and 11 (security).

## Files

| File                                               | Purpose                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261014120000_schema.sql`    | Extensions, enums, tables, constraints, indexes, the platform settings row                                                   |
| `supabase/migrations/20261014120100_security.sql`  | Helper functions and RPCs, RLS on every table, grants, policies                                                              |
| `supabase/migrations/20261014120200_triggers.sql`  | `updated_at`, auth profile creation, booking insert rules, append-only audit log, course publish guard, Realtime publication |
| `supabase/migrations/20261014120300_catalogue.sql` | Instrument and music style catalogue, idempotent, applied in every environment                                               |
| `supabase/seed.sql`                                | Development-only. Adds no data yet. No people, prices or bookings, ever.                                                     |
| `supabase/tests/`                                  | Vitest suite run against PGlite (in-memory Postgres)                                                                         |

All migrations are idempotent. Running them twice succeeds (the test suite checks this).

## Tables

Conventions: uuid primary keys, snake_case, `timestamptz` in UTC, money as integer minor units with an ISO 4217 code (`char(3)`, checked against `^[A-Z]{3}$`). Mutable tables have `updated_at`, maintained by trigger. Append-only and join tables have `created_at` only.

**Identity and teachers**

- `profiles`: one row per auth user, created by trigger. `role` (`learner`, `teacher`, `admin`) defaults to `learner` and is never client-writable. `display_name` is at most 80 characters. Soft delete via `deleted_at`.
- `teacher_profiles`: one row per teacher, keyed by `profile_id`. `slug` (unique, `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 to 80 characters) is set at application. `verification_status` (`submitted`, `approved`, `rejected`, `suspended`) defaults to `submitted`. Reviews need `reviewed_at`. Rejected and suspended teachers need `rejection_reason`.
- `instruments`, `music_styles`: lookup tables with unique slugs.
- `teacher_instruments`, `teacher_styles`: join tables with composite primary keys.

**Availability and offerings**

- `availability_rules`: weekly windows (`weekday` 0 to 6, Sunday = 0) in the teacher's timezone. `end_local_time > start_local_time`. Optional `valid_from` and `valid_to` dates.
- `availability_exceptions`: `starts_at` and `ends_at` with `kind` `blocked` or `extra`.
- `lesson_offerings`: `duration_minutes` in (30, 45, 60), price, currency, `is_trial`, `is_active`. Unique on `(id, teacher_id)` so bookings can prove the teacher matches.

**Bookings and payments**

- `bookings`: `time_range` is a stored generated `tstzrange` with `[)` bounds. `status` defaults to `pending_payment`. Price, currency and fee are snapshotted. Unique on `(learner_id, idempotency_key)`.
  - Double-booking guard: `EXCLUDE USING gist (teacher_id WITH =, time_range WITH &&) WHERE status IN ('pending_payment','confirmed','in_progress')`. Violations raise SQLSTATE `23P01`.
  - Check constraints: end after start, fee within price, learner is not the teacher, `hold_expires_at` required while pending, `cancelled_at` required when cancelled.
  - Composite foreign key `(offering_id, teacher_id)` to `lesson_offerings`.
  - Insert trigger: the start must be in the future (checked against `now()`), and the length must equal the offering's duration.
- `payments`: one row per provider attempt. `provider_ref` is unique. Status: `pending`, `succeeded`, `failed`, `refunded`.
- `webhook_events`: the provider event id is the primary key, so processing is idempotent. No client access.
- `platform_settings`: singleton row. `platform_fee_bps` defaults to 0 as a placeholder (see Decisions).

**Chat**

- `conversations`: one per learner and teacher pair (unique).
- `messages`: `body` 1 to 2000 characters, not whitespace-only. Optional `attachment_path`. Soft delete via `deleted_at`. Index on `(conversation_id, created_at desc)`.

**Courses and reviews**

- `courses`: `status` (`draft`, `review`, `published`, `archived`). Unique on `(teacher_id, slug)`.
- `course_lessons`: unique `(course_id, position)`, deferrable so lessons can be reordered in one transaction.
- `reviews`: one per booking. `rating` 1 to 5. Composite foreign key to `bookings (id, learner_id, teacher_id)`, so the review must match the booking.
- `lesson_notes`: teacher-authored, visible to the matching learner. Composite foreign key to the booking.
- `practice_sessions`: learner's practice log. `taal_slug` (taal definitions live in code), `tempo_bpm` 20 to 300. Optional booking, linked by a composite foreign key that also requires the same learner.

**Moderation, notifications, audit**

- `reports`: `target_type` (`profile`, `message`, `review`, `course`) and `status` (`open`, `resolved`, `dismissed`). `resolved_at` is set if and only if the report is not open. Polymorphic `target_id` has no foreign key.
- `notifications`: `type`, `payload` (jsonb), `read_at`.
- `admin_audit_log`: append-only. Update, delete and truncate are blocked by trigger for every role, including the owner and the service role.

## Access model

RLS is enabled on every table. A table with no policy is inaccessible. `anon` and `authenticated` start with no privileges (`revoke all ... from anon, authenticated`) and are granted back only what each role needs. Column-level grants protect fields clients must never write.

| Table                                           | anon                                                                                                                      | authenticated                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                      | select of 6 public columns (`id`, `display_name`, `timezone`, `language`, `country`, `avatar_path`) for approved teachers | select own, admin, approved teachers, booking or chat counterparts. Update of 5 editable columns on own row. No insert or delete. `role` is never writable. |
| `teacher_profiles`                              | select approved                                                                                                           | select approved, own, admin. Insert own (`submitted` only, no verification fields). Update own (`headline`, `bio`, `intro_video_path`, `languages`).        |
| `instruments`, `music_styles`                   | select                                                                                                                    | select. Writes admin only.                                                                                                                                  |
| `teacher_instruments`, `teacher_styles`         | select approved                                                                                                           | select approved, own, admin. Insert and delete own.                                                                                                         |
| `availability_rules`, `availability_exceptions` | none                                                                                                                      | select own or admin. Manage own. Learners use `teacher_busy_ranges()`.                                                                                      |
| `lesson_offerings`                              | select active and approved                                                                                                | select active and approved, own, admin. Manage own.                                                                                                         |
| `bookings`                                      | none                                                                                                                      | select as participant or admin. **No insert, update or delete grant.**                                                                                      |
| `payments`                                      | none                                                                                                                      | select as participant or admin. No writes.                                                                                                                  |
| `webhook_events`                                | none                                                                                                                      | none                                                                                                                                                        |
| `platform_settings`                             | none                                                                                                                      | select admin only.                                                                                                                                          |
| `conversations`                                 | none                                                                                                                      | select as participant or admin. Insert as learner, only with a non-cancelled booking.                                                                       |
| `messages`                                      | none                                                                                                                      | select as participant (not soft-deleted) or admin. Insert as sender, only with a non-cancelled booking. No update or delete.                                |
| `courses`                                       | select published and approved                                                                                             | select published and approved, own, admin. Insert and update own. Publishing is admin-only (trigger).                                                       |
| `course_lessons`                                | select when the parent course is visible                                                                                  | select when visible. Manage when the parent course is owned.                                                                                                |
| `reviews`                                       | select visible                                                                                                            | select visible or admin. Insert as learner of a completed booking, with `is_visible` not client-settable. No update or delete.                              |
| `lesson_notes`                                  | none                                                                                                                      | teacher: select, insert, update body, delete own. Learner: select own.                                                                                      |
| `practice_sessions`                             | none                                                                                                                      | select and insert own.                                                                                                                                      |
| `reports`                                       | none                                                                                                                      | select own or admin. Insert own (no resolution fields).                                                                                                     |
| `notifications`                                 | none                                                                                                                      | select own. Update `read_at` only.                                                                                                                          |
| `admin_audit_log`                               | none                                                                                                                      | select admin. Insert as admin, with `actor_id = auth.uid()`.                                                                                                |

**Writes that move money or change booking state** (bookings, payments, webhook_events, platform_settings, review moderation, report resolution) happen only through the service role, after the app's server-side checks. Clients have no write grant on those tables, and RLS would deny them even if a grant existed.

**Service role:** nothing is granted to `service_role` explicitly. Supabase gives it default table privileges in `public` and `BYPASSRLS`. The migrations revoke only from `anon` and `authenticated`. To confirm on a real project, run `select has_table_privilege('service_role', 'public.bookings', 'UPDATE')` and check the result is `true`.

**Helper functions and RPCs** (all `set search_path = ''`, fully qualified names):

| Function                                                       | Who may execute     | Purpose                                                                                                                                                                                            |
| -------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.is_admin()`                                            | authenticated       | True when `auth.uid()` is an active admin. Read from the database, never from a claim.                                                                                                             |
| `public.is_approved_teacher(uuid)`                             | anon, authenticated | Approved and not soft-deleted. Public read policies use it.                                                                                                                                        |
| `public.has_chat_booking(uuid, uuid)`                          | authenticated       | Chat gate. The caller must be one of the pair.                                                                                                                                                     |
| `public.teacher_busy_ranges(uuid, timestamptz, timestamptz)`   | anon, authenticated | Returns `table (starts_at, ends_at)` for a teacher. Covers bookings in pending, confirmed or in-progress status, plus blocked exceptions, that overlap the window. No identifiers or learner data. |
| `public.submit_teacher_application()`                          | authenticated       | The only path for a teacher to set `verification_status = 'submitted'`. Allowed only from `rejected` or `submitted`. Clears `rejection_reason`.                                                    |
| `public.admin_review_teacher(uuid, verification_status, text)` | authenticated       | Admin decision (`approved`, `rejected`, `suspended`). Checks `is_admin()`, updates the teacher, and writes `admin_audit_log` in the same transaction. Returns void.                                |

**Triggers**: `set_updated_at` (mutable tables), `handle_new_user` (on `auth.users` insert, always creates a `learner` profile and never reads `role` from user or app metadata), `enforce_booking_insert_rules`, `prevent_admin_audit_log_mutation`, `enforce_course_publish_rights`.

**Realtime:** `public.messages` is added to the `supabase_realtime` publication when that publication exists. Realtime delivers only rows the subscriber's RLS policy allows.

## Running the migrations on Supabase

- **Shared or production:** `supabase db push` applies the four migration files in filename order, including the instrument and style catalogue. It does not run `seed.sql`.
- **Local development:** `supabase db reset` applies the migrations and then `supabase/seed.sql`. The repository does not contain `supabase/config.toml` yet. Run `supabase init` (or add the file) before using the CLI. Creating it is outside the scope of this change.
- **Dev SQL editor:** paste the migration files in filename order. Do not run `seed.sql` against production.

## Running the tests

```
npx vitest run supabase/tests
```

The suite builds an in-memory PGlite database per test file with an auth stub (`auth.users`, `auth.uid()`), the `anon` and `authenticated` roles and the migrations, which include the catalogue. Each test runs in a transaction that is rolled back afterwards. Role switching (`set role`) and the JWT subject (`request.jwt.claim.sub`) are used to exercise RLS.

`vitest.config.ts` sets `fileParallelism: false`. Parallel test files each start a WASM Postgres instance, and running them together exhausts V8's wasm code space in a shared worker.

## Decisions

Each decision below was made where the brief or plan was silent. The lead should review the items marked **review**.

1. **Extensions** (`btree_gist`, `pg_trgm`) are installed in the default schema (`public`). The exclusion constraint needs the GiST operator class visible on the migration search path. Moving them to an `extensions` schema would need a `search_path` change. **Review:** low priority.
2. **Trigram indexes.** `pg_trgm` is available in both PGlite and Supabase, so no btree fallback is needed. The GIN index on display name is on `profiles.display_name`, because the name lives there. The index on bio is on `teacher_profiles.bio`.
3. **Teacher role promotion (decided).** `admin_review_teacher` sets `profiles.role` to `teacher` on approval and to `learner` on rejection or suspension. It never changes an admin's role. The app's teacher views depend on this, and `workflows.test.ts` checks it.
4. **Booking status default** is `pending_payment`. `hold_expires_at` is required while pending, and `cancelled_at` is required when cancelled. The insert trigger requires the start to be in the future and the length to match the offering. **Consequence (review):** past bookings, such as a historical backfill, cannot be inserted by any role. If that is needed, add a controlled import path.
5. **Availability is not enforced on bookings.** The database does not reject a booking that falls inside a blocked exception or outside a weekly rule. The booking service must check `teacher_busy_ranges()` and the rules. **Review.**
6. **Chat requires a booking.** The rule is "any booking status except `cancelled`", as briefed. That includes `refunded`, `no_show` and `expired`. **Review:** confirm whether those should allow chat.
7. **One conversation per learner and teacher pair.** The plan's `conversation type` (`booking` or `direct`) and per-booking threads are not modelled, as the brief specifies. **Review.**
8. **Message body is required.** It must be 1 to 2000 characters and not whitespace-only. An attachment-only message therefore needs a caption. **Review.**
9. **Message reads.** The participant policy checks that the viewer is a participant. I read "the sender is a participant" as a description of who may read, not as a data check. Soft-deleted messages are hidden from participants and visible to admins.
10. **Reviews.** `is_visible` is not client-settable, and reviews cannot be updated or deleted by clients. Moderation is service-only. I added an admin select policy so moderators can read hidden reviews, which the brief did not list. Public reviews expose `learner_id` (a uuid, not a name). Reviewer names are not visible to anon because the learner profile is not public. **Review.**
11. **Lesson notes.** Teachers may delete their own notes, following "teacher manages own rows". There is no soft-delete column. **Review:** consider `deleted_at`.
12. **Course publishing.** Owners can save drafts and move a course to `review`. Only admins (or trusted server code, which has no JWT subject) can set `published`. The admin path runs through the service role, because there is no admin update policy on courses. I added an admin select policy on courses. Courses cannot be deleted by clients. They should be archived.
13. **Course lessons.** A lesson is visible to anyone who can see its parent course, as the brief specifies. That means `media_path` and lesson titles are visible for published courses. Preview-only media paths or a separate protected path are a Phase 2 decision. **Review.**
14. **Reports.** The target and status values listed above are my choice. Resolution is service-only, because the brief gives no admin update policy. **The data model has no `blocks` table, though the plan requires "report and block a user".** This is a gap for the lead to resolve.
15. **Payments.** Status values are my choice: `pending`, `succeeded`, `failed`, `refunded`. `booking_id` is not unique, because a booking may have several provider attempts.
16. **Audit log actor.** `actor_id` is a foreign key to `profiles` with the default `NO ACTION`. A profile that has audit rows cannot be hard-deleted. Account deletion therefore needs soft delete or anonymisation, which the GDPR and DPDP work will decide.
17. **Teacher verification.**
    - Rejected and suspended decisions require a reason, stored in `rejection_reason`. The reason is also used for suspension, which the column name does not suggest. **Review.**
    - Admin transitions are not restricted. Any of `approved`, `rejected` and `suspended` may follow any state. **Review.**
    - Resubmission clears `rejection_reason` but leaves `reviewed_by` and `reviewed_at`, as the spec says.
    - `slug` is set at application and is not client-updatable.
18. **Teacher profile visibility.** `teacher_profiles` uses a table-level grant, so `reviewed_by` and `reviewed_at` are readable on approved teacher rows. These are admin ids, not PII. A column-level restriction would break PostgREST `select=*`, and it cannot hide `rejection_reason` from the owner without a split table.
19. **Column-level reads for anon.** The anon grant on `profiles` lists six columns. PostgREST `select=*` fails for anon on column-restricted tables, so the app must list columns explicitly.
20. **Counterpart reads.** A booking or conversation of any status, including `cancelled`, lets the counterpart read the other party's public profile columns. **Review:** confirm whether cancelled bookings should count.
21. **Profiles.** `timezone` is checked for length only. IANA validity belongs in the Zod layer, because `pg_timezone_names` cannot be used in a check constraint. `country` is a two-letter uppercase code. Display name is truncated to 80 characters from `full_name` on signup.
22. **Money.** Currency codes must match `^[A-Z]{3}$`. Booking fees must not exceed the price.
23. **Platform fee placeholder (review).** `platform_fee_bps` defaults to `0`. The column comment and migration comment mark this as a placeholder pending the business decision in plan section 17, item 1. The singleton row is inserted by the migration.
24. **Teacher busy ranges.** The function accepts any teacher id and returns only time bounds. It has no window-size cap. It rejects `p_to <= p_from`.
25. **Catalogue in a migration (decided).** Instruments and music styles are seeded by `20261014120300_catalogue.sql`, which is idempotent and applies in every environment. `seed.sql` adds development data only.
26. **Teacher and learner FKs.** Every teacher reference is `teacher_profiles(profile_id)`. Every learner reference is `profiles(id)`. Composite foreign keys cover offering-teacher, review-booking, lesson-note-booking and practice-session-booking relationships. The FK names are Postgres defaults: `bookings_learner_id_fkey`, `bookings_teacher_id_fkey`, `conversations_learner_id_fkey`, `conversations_teacher_id_fkey`. The migrations test asserts these names.
27. **Default privileges.** `alter default privileges` revokes table and function grants from `anon` and `authenticated` for future objects in `public`. New functions need an explicit grant.
28. **Hard deletes.** Foreign keys to profiles use `NO ACTION`, so business data blocks hard deletes. Child join rows (teacher instruments, availability, course lessons) cascade.
29. **Timestamps.** Mutable tables have `updated_at`. `messages`, `admin_audit_log`, `webhook_events` (`received_at` and `processed_at`) and the join tables follow the brief and have no `updated_at`.
30. **Checks I added beyond the brief:** bounded text lengths on all user-entered fields, slug formats on slugs, weekday range, time-order checks, `learner_id <> teacher_id`, `fee_minor <= price_minor`, pending and cancelled consistency, and the report resolution invariant. Each is a small, local rule, and each is listed here so it can be removed if the lead disagrees.

## Open items

- Public reviews show no reviewer name (item 10).
- No `blocks` table (item 14).
- Availability is not enforced on bookings (item 5).
- Past bookings cannot be inserted (item 4).
- The platform fee is a placeholder (item 23).
- `supabase/config.toml` is not present (see Running the migrations).
