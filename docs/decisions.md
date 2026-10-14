# Decisions

Each entry records what was decided, why, and what the code does until you confirm it. Entries marked **OPEN** need your decision before the feature can go live. Engineering defaults are set in `src/constants/booking.ts` and in the database migrations, so they can be changed in one place.

## Business decisions (OPEN)

| #   | Topic                     | Current code behaviour                                                                                                | What you need to decide                                                                |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Platform fee              | `platform_settings.platform_fee_bps = 0`. Fees are calculated (rounded down) but are zero.                            | Fee percentage, and whether it applies to trials                                       |
| 2   | Payment provider          | None. Bookings stay `pending_payment`, and the UI says online payment is not enabled.                                 | Provider for card collection, and a payout provider for teachers in Pakistan and India |
| 3   | Video provider            | None. The token route returns `503`.                                                                                  | Approve the LiveKit or Agora spike (product plan, Phase 0)                             |
| 4   | Brand name                | "MUSME" in the app                                                                                                    | MUSME, MUV or MUS Studio                                                               |
| 5   | Lesson lengths            | 30, 45 and 60 minutes (database check constraint)                                                                     | Confirm                                                                                |
| 6   | Cancellation and refunds  | Not implemented                                                                                                       | Policy and deadlines                                                                   |
| 7   | Reviews                   | Table exists and is protected by RLS. No UI yet. Reviewer names are not public.                                       | Who may review and when (currently planned: completed lessons only)                    |
| 8   | Chat after a booking ends | Chat is open for any booking status except `cancelled`, so `refunded`, `no_show` and `expired` bookings also allow it | Which booking states keep chat open                                                    |
| 9   | Blocking users            | The product plan requires report and block. Reports exist. There is no block table yet.                               | Confirm block as a Phase 1 feature                                                     |
| 10  | Account deletion          | Not designed. Foreign keys to `profiles` use NO ACTION, so deletion needs an anonymisation design                     | Deletion and retention policy                                                          |

## Engineering defaults (PLACEHOLDER)

These values are engineering choices, not business rules. Change them in `src/constants/booking.ts`.

| Setting                           | Value                                        | Source                                             |
| --------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| Slot start step                   | 30 minutes                                   | Engineering default                                |
| Minimum notice before a lesson    | 60 minutes                                   | Engineering default                                |
| Booking window                    | 14 days                                      | Engineering default                                |
| Hold while paying                 | 15 minutes                                   | Product plan, section 10                           |
| Join window                       | 10 minutes before to 15 minutes after        | Product plan, section 7                            |
| Chat message limit                | 2,000 characters                             | Product plan, section 8                            |
| Practice Room tempo labels        | Slow below 70 BPM, Medium to 150, Fast above | Placeholder thresholds for display only            |
| Speed trainer step                | +4 BPM every 4 cycles                        | Prototype default                                  |
| Bol patterns and taal definitions | As in the prototype                          | Must be validated by a tabla teacher before launch |

## Technical decisions

**Approval makes a teacher.** `admin_review_teacher` sets `profiles.role` to `teacher` on approval, and back to `learner` on rejection or suspension. Admin accounts are never changed by it. The app's teacher views depend on this role, and a test in `supabase/tests/workflows.test.ts` checks it.

**Instrument and style catalogue is a migration.** `20261014120300_catalogue.sql` seeds the catalogue in every environment, including production. `supabase/seed.sql` is for development data only, and it adds none yet.

**Teacher slug is fixed after the first save.** Profile links must not break. Changing it later needs an explicit admin tool.

**Chat requires a booking between the pair.** This keeps messaging tied to real lessons and limits spam. The rule is enforced by row level security, so the app cannot bypass it. The open question is item 8 above.

**Holds are written through the service role after checks.** Booking and payment rows cannot be written by authenticated users directly. This keeps money and booking state changes in one reviewed place. The database still enforces double-booking and idempotency.

**Admin decisions go through `admin_review_teacher`.** It checks `is_admin()` and writes the audit log in the same transaction, so a decision cannot happen without its record.

**Roles are not self-service.** Users cannot change `profiles.role` (column grants). Admins are created by a database owner. A promotion UI is not built yet.

**Public reads are explicit.** Anonymous visitors read only the columns the public pages need. Teachers can read the names of learners they have bookings or conversations with. Email addresses are never exposed, because they live in `auth.users`.

**Fees round down to the minor unit.** The platform never takes a fraction of a unit that the teacher is owed.

**Time zones.** Slots are computed in the teacher's zone, and shown in the learner's zone when signed in (otherwise the teacher's). Daylight saving is handled by converting each wall-clock time separately.

**Authentication is magic link only.** No passwords are stored. Supabase rate limits sign-in emails.

**CSP allows inline styles.** `style-src 'unsafe-inline'` is needed for Next.js and some component styles. Scripts require the per-request nonce. Revisit if the design system moves to hashed styles.

**Money in minor units.** All amounts are integers in minor units with an ISO currency code. Floats are never stored or compared.

**Vercel Cron for expiry.** Expiry runs every 5 minutes. A hold can therefore outlive its 15 minute window by up to 5 minutes, but it never blocks a slot indefinitely. A pending hold still blocks its slot until it is expired.

**Test runs are serial.** Each database test file starts an in-process Postgres (PGlite) instance. Running files in parallel exhausted WebAssembly memory, so `vitest.config.ts` runs them one at a time.

## Practice Room and classroom (OPEN)

These come from the Practice Room build and the database review. Each needs a decision or a listening test before launch.

| #   | Topic                                         | Current behaviour                                                                                                                                                                        | Options                                                                                                                                                        |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Upper Sa string of the tanpura drone          | The string is a feedback delay loop. Web Audio limits such a loop to one 128-frame block, so the string plays flat from about F3 upward at 44.1 kHz and from about F#3 upward at 48 kHz. | (a) Recorded tanpura loop, as the product plan specifies (rule 4). (b) An AudioWorklet loop. (c) Drop the upper string in the affected keys. Recommended: (a). |
| 12  | Taal timing in background tabs                | Browsers throttle `setInterval` in background tabs to about once per second. The 120 ms lookahead then leaves gaps in the taal audio.                                                    | A worker-based timer, or accept the limit and warn the user                                                                                                    |
| 13  | Tuner status announcements                    | The screen-reader status can change often when a reading sits near the ±5 cent boundary.                                                                                                 | Add hysteresis before announcing a change                                                                                                                      |
| 14  | Pitch detection thread                        | Runs on the main thread at 25 Hz. The product plan asks for an AudioWorklet in production.                                                                                               | Move to an AudioWorklet before launch                                                                                                                          |
| 15  | Audio is not yet heard or tested in a browser | Verified with type checks, lint and unit tests of the pure modules only                                                                                                                  | A listening test with real headphones and a tabla teacher                                                                                                      |

## Database review items for your attention

These come from the database review. Full notes are in [database.md](database.md#decisions).

- **Past bookings cannot be inserted by any role.** The insert trigger requires a future start. A historical backfill needs its own path.
- **Availability is enforced in the booking service, not in the database.** The service checks `teacher_busy_ranges` and the teacher's slot list before inserting.
- **Admin resolution of reports and review moderation is service-only.** Nothing grants admins an update path on those tables yet.
- **Lesson notes can be hard-deleted by the teacher.** There is no `deleted_at` column.
- **The service role relies on default privileges.** Confirm it with `has_table_privilege` on the real project before launch.
- **`supabase/config.toml` is not present.** `supabase db reset` will not run until someone adds it with `supabase init`.
