# Architecture

MUSME is a Next.js 16 (App Router) application on Supabase (Postgres, Auth, Realtime), deployed on Vercel. Live video and payments are behind interfaces until their providers are chosen (see [decisions.md](decisions.md)).

## Layers

```
Browser
  │
React UI          Server Components by default; small client islands for forms and Realtime
  │
Server actions    Validate input (Zod), check the session, call a feature service
Route handlers    Thin: parse, check, call a service, return the standard envelope
  │
Feature services  Business rules: holds, slot checks, fees, join window, admin review
  │
Repositories      Supabase queries only, with every row validated by Zod at the boundary
  │
Supabase          Postgres (constraints, RLS, functions), Auth, Realtime
```

The UI never queries the database directly. Business rules live in `features/*` and in pure `domain/` modules that have no framework or database imports, so they are unit tested in Node.

## Access model

Two Supabase clients exist, and the difference is the security boundary:

| Client       | Source                                                | Used for                                                                          | Row level security                                                   |
| ------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| User client  | `lib/supabase/server.ts` (anon key + user cookies)    | Reads, and writes the user may make directly (profile, own application, messages) | Applies                                                              |
| Admin client | `lib/supabase/admin.ts` (service role, `server-only`) | Money and booking state (holds, expiry), availability reads for slots             | Bypassed. Only used after the service checks identity and permission |

Rules:

- Anything that moves money or changes booking state is written only through the admin client, after the service checks the session and the caller's role. The database also denies direct writes to those tables for authenticated users.
- Admin decisions go through `admin_review_teacher`, a database function that checks `is_admin()` and writes the audit log in the same transaction.
- Roles are read from `profiles.role` in the database. They are never read from token claims, and users cannot change their own role (column-level grants).
- Admin pages return 404 to non-admins, so the area's existence is not revealed.

## Request pipeline

`src/proxy.ts` runs before matched requests:

1. Generates a per-request CSP nonce and sets `Content-Security-Policy` (`lib/security/csp.ts`).
2. Refreshes the Supabase session and verifies the user with `getUser()`.
3. Redirects anonymous visitors on protected paths to `/login?next=...`. The redirect cannot loop: the login page is not protected, and `safeNextPath` refuses `/login` as a destination.

Static security headers (HSTS, frame denial, referrer policy, permissions policy) are set in `next.config.ts`.

## Booking flow

1. `getOpenSlots` (admin client) loads the teacher's rules, exceptions and busy ranges, then `findOpenSlots` (pure) computes start times in the teacher's zone.
2. The learner picks a slot. Each slot is a plain HTML form (no client JavaScript needed).
3. `requestLessonFormAction` validates the form, requires a session, and calls `createTrialHold`.
4. `createTrialHold` re-checks the slot on the server, computes the fee from `platform_settings`, and inserts a `pending_payment` booking with a 15 minute hold. The idempotency key (unique per learner) makes a repeat submit return the same booking.
5. The exclusion constraint in Postgres rejects overlapping holds, even under concurrent requests (SQLSTATE `23P01`).
6. A cron job (`/api/cron/expire-holds`, every 5 minutes) moves expired holds to `expired`.

Payment is not wired yet. A booking stays `pending_payment` until a provider implements `PaymentProvider` and confirms payment. Nothing is confirmed without a payment.

## Classroom

- `canJoin` is decided by `isWithinJoinWindow` (10 minutes before to 15 minutes after the lesson), and only for `confirmed` or `in_progress` bookings.
- The join token route checks the caller, the booking, its status and the window, in that order, before asking the video provider for a token.
- Until a provider is configured, the token route returns `503` with a clear message, and the classroom shows the practice tools without video.
- The Practice Room (`src/features/practice-room`) runs locally in the browser: audio is scheduled on the AudioContext clock, and the tuner uses the microphone with echo cancellation, noise suppression and automatic gain control turned off.

## Chat

- A conversation is created only when a booking exists between the learner and the teacher. The database enforces this in the insert policy.
- Messages are plain text, capped at 2,000 characters, and rendered as text nodes (no HTML).
- Realtime: a client component subscribes to `INSERT` events on `messages` for one conversation and calls `router.refresh()`. Row level security filters the events, so a subscriber only receives rows they may read.

## Folder structure

```
src/
  app/                  routes only: pages, layouts, route handlers, error and loading states
  components/           ui/ (primitives), layout/ (header), shared/ (state panels)
  constants/            routes, business settings (placeholders are marked)
  features/             one folder per business area
    admin/  auth/  booking/  chat/  classroom/  payments/  practice-room/  teach/  teachers/
  lib/                  env-free infrastructure: Supabase clients, logger, CSP, errors, results
  proxy.ts              request pipeline (see above)
  utils/                pure helpers: time zones, money, safe redirects, class names
supabase/
  migrations/           schema, security (RLS, grants, functions), triggers
  seed.sql              development data only (instruments and styles)
  tests/                database tests against an in-process Postgres (PGlite)
docs/                   architecture, API, database, deployment, decisions, product plan
```

## Conventions

- Conventional commits on feature branches. `main` is protected and is never committed to directly.
- Every server action and route handler returns the standard envelope (`{ success, message, data?, fieldErrors? }`).
- Errors are logged as structured JSON with sensitive keys redacted (`lib/logger.ts`). Visitors see friendly messages and never stack traces.
- Pages that read data call `connection()` so they render per request. Nothing is prerendered from data that could be stale or missing configuration.
