# MUSME Platform: Product and Technical Plan

**Status:** Draft v0.1, for review. Nothing is built yet. The decisions in section 17 are needed before Phase 0 starts.
**Source:** "MUV Startup Pitch Deck Presentation" (June 2025, 10 slides). Deck figures are quoted as the deck states them and have not been independently verified.

---

## 1. Summary

MUSME is a marketplace and live practice studio for music learners and teachers.

- **Learners** choose a teacher, book live 1:1 classes, chat, and join a video room with a built-in **Practice Room**: a tabla taal player with adjustable tempo, a tanpura drone, and a tuner.
- **Teachers** publish a profile, sell courses, and share their best lessons. Learners book directly from those pages.
- **Admin (you)** approves teachers, runs bookings, refunds and payouts, manages the catalogue, moderates content, and reviews analytics.

---

## 2. What the deck tells us

| Deck claim | Reading for the product |
|---|---|
| Learners pay $40–90/hr for lessons globally | Price anchor for the learner side. Rates are set per teacher; no platform price rule is implied yet. |
| Teachers in Pakistan and India earn very little | Supply-side promise: fair rates and verified teachers. |
| Online music education: $3.43B (2025) growing to $6.63B (2030), ~14.1% CAGR | Market size as stated in the deck. Verify before investor use. |
| Yousician: recorded, interactive lessons. LessonFace/Take Lessons: 1:1 online video. Reverb/Gear4music: marketplaces. | **The gap:** live 1:1 teaching, practice tools, and South Asian and global instruments in one place. This is the differentiator to protect. |
| Revenue: subscriptions, e-commerce commission, digital goods, P2P resale | Phase 1 needs only booking commission and course sales. Subscriptions and resale come later. |

**Deck issues to fix before investor use**

1. **Teacher earnings conflict (slide 2):** "18 to 30$ per month in Pakistan" and "$240 USD/month Pakistan" give two figures for the same country with different units. State the basis (per hour, per month, per student).
2. **Brand name:** the deck says MUSME, the file is named MUV, slide 3 says "MUS Studio", and the header says "STEAM". Choose one name.
3. **Typos:** "OPPURTUNITY" (slide 2), "COMPITITORS" (slide 6).
4. **NFTs** are listed under digital goods (slide 6). Recommend dropping them from scope because of regulatory and reputational risk.
5. **AR/VR try-on and the Stage Simulator** are R&D items. Keep them out of the MVP.

---

## 3. Users and roles

| Role | Core jobs |
|---|---|
| **Learner** | Find a teacher, book a live class or trial, chat, join class, practise, leave a review. |
| **Teacher** | Get approved, manage profile, availability, courses and lessons, see earnings and lesson notes. |
| **Admin** (you) | Approve teachers, manage bookings, refunds and disputes, run payouts, moderate content, view analytics and audit logs. |
| **Guest** | Browse teachers, profiles and public course previews. Cannot book. |

Roles are stored in the database (`profiles.role`) and checked on the server. The admin role is never taken from client input.

---

## 4. Feature scope

### Phase 1: MVP ("book, learn, practise")

**Learner**
- Sign up and log in (email magic link, Google OAuth).
- Discover teachers: search, filter by instrument and style, language, price, rating, and timezone.
- Teacher profile: bio, credentials, intro video, courses, reviews, and availability.
- Book a live class or trial lesson. Times are shown in the learner's timezone. Lengths are 30, 45 or 60 minutes.
- Email confirmation with a calendar invite (ICS). Reminders at 24 hours and 10 minutes before class.
- Text chat with the teacher, per booking and as a general thread. Plain text plus small file attachments.
- Live video class with the Practice Room (section 6) and a pre-join device check.
- My bookings: reschedule or cancel within the policy.
- Practice log: minutes practised, taal used, tempo reached.
- Review after a completed lesson only. Reviews are not editable once posted.
- Report and block a user.

**Teacher**
- Application and admin approval. Upload identity documents, instrument credentials, and a short sample performance.
- Profile editor: photo, bio, instruments, styles, languages, rates, intro video.
- Availability: weekly rules, exceptions, and buffer time between classes.
- Lesson offerings: duration, price, and trial flag.
- Course builder (minimal): title, description, price, ordered lessons, PDF notes. Draft, review and publish states.
- Lesson notes per student, visible to that student.
- Earnings and payout status (read-only in MVP).

**Admin**
- Approve, reject, or suspend teachers. Every decision is written to the audit log.
- Booking operations: search, cancel, refund, reschedule, resolve disputes.
- Payments and payouts overview.
- Course and review moderation. Report queue.
- Catalogue: instruments, styles, and taal definitions.
- Business settings: platform fee, cancellation and refund policy, feature flags.
- Analytics: bookings, gross volume, active teachers, conversion, no-show rate.

**Platform**
- Responsive web app (mobile first) and an installable PWA. No native app in Phase 1.
- Transactional email (Resend). Cron-driven reminders.
- Accessibility: keyboard operable, visible focus, WCAG 2.1 AA contrast.

### Phase 2: Courses and growth

- Learner subscription tiers. Pricing is a business decision (section 17).
- Video course hosting with adaptive streaming and signed playback (Mux or Cloudflare Stream, not raw storage).
- Course purchases and lesson previews.
- Group classes (3–10 learners) via the video SFU.
- Lesson recording with per-participant consent, replay for the learner, and a retention policy.
- Google and Outlook calendar sync. WhatsApp reminders (Meta WhatsApp Cloud API, per the stack standards).
- Digital goods store (sheet music, backing tracks, e-books) with licence controls.
- Automated teacher payouts and tax documents.
- Learner progress dashboard and streaks.

### Phase 3: Marketplace and immersion

- Instrument marketplace (new and used) with P2P resale and escrow.
- Events: recitals, masterclasses, and global showcases with ticketing.
- Community feed.
- AR try-on and Stage Simulator, as R&D spikes only.
- Native mobile apps (React Native / Expo) reusing the API layer.

### Not planned

- **NFTs.** Recommended for removal (section 2).
- **Dedicated VR experiences** until product-market fit is proven.

---

## 5. Key flows

**Booking**
Discover → teacher profile → choose length and time (learner timezone) → review price → pay → booking `confirmed` → email and calendar invite → reminders → join window opens 10 minutes before start → class → lesson notes → review.

**Live class**
Join → device check (camera, mic, headphones, network) → connect (token issued by server, section 7) → class with Practice Room and chat → end (teacher or timer) → notes saved → booking marked `completed`.

**Teacher onboarding**
Apply → upload documents and sample → admin review → approved (profile goes live) or rejected with reason → payout details verified by the payment provider.

---

## 6. Practice Room (signature feature)

The Practice Room is the live-class toolkit. It is the main differentiator against the competitors in the deck.

| Component | MVP spec |
|---|---|
| **Taal player** | Taals with matra count, vibhag grouping, tali and khali markers, and bol patterns. Launch set: Teentaal (16), Keherwa (8), Dadra (6), Jhaptaal (10). Ektaal, Rupak and others later. |
| **Tempo** | 40–240 BPM, adjustable with slider or keys (left/right ±1, up/down ±5). Slow / medium / fast labels as a guide. |
| **Speed trainer** | Raises tempo by a set step every N cycles until a target tempo. |
| **Tanpura drone** | Tonic (Sa) selectable across 12 keys. Four-string pattern (Pa, Sa, Sa upper, Sa lower). Volume control. |
| **Tuner** | Pitch detection from the microphone, cents deviation, A4 reference adjustable from 415 to 466 Hz, and swara names relative to the chosen Sa. |
| **Backing to teacher** | Toggle to send the taal and drone mix to the teacher inside the video call. |
| **Practice log** | Minutes, taal, and tempo saved per session. |

### Engine rules

1. **Timing.** Use a lookahead scheduler on the AudioContext clock: a short timer tick (about 25 ms) that schedules beats about 120 ms ahead. Never schedule audio with `setInterval` alone, because timer jitter is audible.
2. **UI sync.** Read the scheduled beat times on `requestAnimationFrame` and update only the beat indicator. Do not update React state on every beat.
3. **Samples.** Tabla bols are recorded in-house or licensed. Decode each sample once, cache it, and preload when the room opens.
4. **Tanpura.** Production uses a recorded loop. The prototype uses a synthesised plucked-string model.
5. **Taal definitions.** Matras, vibhags, tali and khali positions, and bol patterns must be validated by a tabla teacher before launch. The prototype patterns are illustrative.
6. **Microphone constraints.** Set `echoCancellation`, `noiseSuppression` and `autoGainControl` to `false`. These processors degrade music. Recommend headphones.
7. **Tuner.** Production runs YIN-style pitch detection in an AudioWorklet so it stays off the main thread. Display updates are throttled to 20–30 fps. Accuracy target: within ±2 cents. The prototype's autocorrelation detector was within about 0.2 cents on most test tones but drifted up to about 6 cents at 196–262 Hz, which would mislabel an in-tune low note as "Flat". Production must pass a tone-accuracy test across the instrument range before release.
8. **Backing mix.** When "Backing to teacher" is on, route the taal and drone mix into the outgoing WebRTC audio track through a Web Audio destination node.

### Latency reality

Local practice (drone, taal, tuner) has no network latency. Live playing between teacher and student adds roughly 100–300 ms round trip, depending on distance and network. This is a physical limit. The design handles it by having the teacher lead and the student follow, showing a connection-quality indicator, and recommending wired or strong Wi-Fi connections.

---

## 7. Live class and video

- **Provider:** LiveKit (open source, self-host or cloud) or Agora. Run a one-week Phase 0 spike on both before choosing. Test on real mobile networks in Pakistan and India.
- **Spike criteria:** music audio quality with processing off, Opus stereo and bitrate control, round-trip latency, reconnection behaviour, TURN cost, React SDK quality, per-minute cost, and data residency.
- **Token flow:** `POST /api/classes/[bookingId]/token` checks that the caller owns the booking and that the time is inside the join window (10 minutes before start to 15 minutes after end). It then issues a short-lived token scoped to that room. Room names are derived from the booking ID, never from user input.
- **Reconnection:** exponential backoff from 1 s up to 30 s, capped at 8 attempts. After that, show a clear error with a retry button. No unbounded retry loops.
- **Recording:** off by default. Requires explicit consent from every participant. Stored encrypted with a retention period.
- **Group classes:** Phase 2, through the same SFU.

---

## 8. Chat

- Supabase Realtime, with RLS on `messages`. Subscribe per conversation ID, never to the whole table.
- Typing indicators use Realtime Broadcast (ephemeral, not stored).
- Limits: 2,000 characters per message, plain text only. Links are auto-linked only for `http` and `https`, rendered with `rel="noopener noreferrer nofollow"`.
- Attachments: 10 MB maximum. Allowlist of JPEG, PNG, WebP and PDF. Stored in a private bucket and served through short-lived signed URLs.
- Rate limit: 20 messages per 10 seconds per user.
- History: cursor pagination, 30 messages per page.
- Moderation: report and block buttons, plus an admin review queue.

---

## 9. Architecture

### Layers (per the engineering standards in `D:\Projects\CLAUDE.md`)

```
Browser
  │
React UI (Server Components by default, small client islands)
  │
Hooks (client-side interaction only; no business rules)
  │
Services (business rules: booking, payments, classes, moderation)
  │
Repositories (Supabase queries only)
  │
Supabase (Postgres, Auth, Storage, Realtime)  ·  LiveKit  ·  Payment provider  ·  Resend
```

The UI never queries the database directly. Route handlers stay thin: validate, call a service, return a typed response.

> **Note:** `D:\Projects\CLAUDE.md` is written for the PeptoLogics project. This plan applies its standards by default. Confirm whether it should govern MUSME too.

### Stack

| Area | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | Standard from CLAUDE.md |
| Styling | Tailwind CSS, shadcn/ui, Lucide icons | Standard from CLAUDE.md |
| Animation | Motion (motion.dev) for React, CSS for hover and simple transitions, canvas for audio visuals | New dependency: approve |
| Forms | React Hook Form + Zod (same schemas on client and server) | Standard |
| Data | Supabase Postgres, Auth, Storage, Realtime | Standard |
| Video | LiveKit or Agora (Phase 0 spike) | New service: approve |
| Payments | Payment provider to be confirmed (section 14) | Open decision |
| Course video | Mux or Cloudflare Stream | Phase 2; new service |
| Email | Resend | Standard |
| Rate limiting | Upstash Redis | New service: approve |
| Hosting | Vercel (cron, analytics, speed insights) | Standard |
| Package manager | npm | Standard |

### Folder structure (proposed)

```
src/
  app/                    routing only: pages, layouts, route handlers
    (marketing)/          home, teachers listing, teacher profile
    (auth)/               login, sign-up, callback
    learn/                learner dashboard, bookings, practice log
    teach/                teacher dashboard, courses, availability
    admin/                admin console
    classes/[id]/         live class and Practice Room
    api/                  webhooks, class tokens, cron jobs
  features/
    booking/              components, hooks, services, validation
    classroom/            video room UI and token handling
    practice-room/        taal engine, tanpura, tuner, Practice Room UI
    chat/
    teachers/
    courses/
    admin/
    payments/
  services/               business rules shared across features
  lib/
    supabase/             clients (server, browser, admin)
    livekit/
    payments/
    logger/
    validations/          shared Zod schemas
  components/
    ui/                   shadcn primitives
    layout/
    shared/               EmptyState, Skeleton, ErrorState
  hooks/                  reusable hooks (useMediaQuery, useDebounce)
  types/
  constants/              routes, taal definitions, instrument catalogue
  utils/                  pure helpers (formatCurrency, formatTimezone)
```

### Rendering strategy

| Route | Strategy |
|---|---|
| Home, teacher listing | Static or ISR (revalidate every 60 s), tag-based revalidation on updates |
| Teacher profile and courses | ISR with on-demand revalidation when the teacher edits |
| Dashboards, bookings, admin | Dynamic, streamed with Suspense and `loading.tsx` |
| Live class and Practice Room | Client-rendered behind auth. Audio engine and video SDK loaded by dynamic `import()` |

---

## 10. Data model

All tables use `snake_case`, UUID primary keys, `created_at` and `updated_at` as `timestamptz` in UTC, and soft deletes (`deleted_at`) where business data must be recoverable. Money is stored as integer minor units (cents or paise) with an ISO currency code. Never floats.

| Table | Purpose and key constraints |
|---|---|
| `profiles` | One row per auth user. `role` enum: `learner`, `teacher`, `admin`. Display name, avatar path, country, timezone, language. |
| `teacher_profiles` | 1:1 with a profile. Headline, bio, `verification_status` enum, intro video path, languages. |
| `instruments`, `music_styles` | Lookup tables. Avoid repeated strings. |
| `teacher_instruments`, `teacher_styles` | Join tables. Composite primary keys. |
| `availability_rules` | Weekly windows in the teacher's timezone, with valid-from and valid-to dates. |
| `availability_exceptions` | Blocked or extra time ranges (`tstzrange`). |
| `lesson_offerings` | Per teacher: title, duration, price, currency, `is_trial`. |
| `bookings` | `time_range tstzrange`, `status` enum (`pending_payment`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`, `refunded`), prices snapshotted at booking time, idempotency key (unique). |
| `payments` | Provider reference (unique), amount, status, link to booking. |
| `webhook_events` | Provider event ID as primary key. Makes webhook processing idempotent. |
| `payouts` | Per teacher. Provider reference (unique), status. |
| `conversations`, `messages` | Conversation type `booking` or `direct`. Messages: body (max 2,000 chars), optional attachment path, soft delete. |
| `courses`, `course_lessons`, `course_purchases` | Course status enum (`draft`, `review`, `published`, `archived`). Unique `(course_id, position)` and `(learner_id, course_id)`. |
| `reviews` | Unique per booking. Rating check 1–5. Only for `completed` bookings. |
| `lesson_notes` | Teacher-authored, visible to the matching learner only. |
| `practice_sessions` | Learner, start, duration, taal, tempo, optional booking ID. |
| `reports` | Reporter, target type and ID, reason, status, resolver. |
| `admin_audit_log` | Actor, action, target, metadata (`jsonb`), timestamp. Append only. |
| `notifications` | User, type, payload, read timestamp. |

**Booking double-booking guard.** This is enforced in the database, not only in code:

```sql
create extension if not exists btree_gist;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    teacher_id with =,
    time_range with &&
  )
  where (status in ('pending_payment', 'confirmed', 'in_progress'));
```

Pending bookings hold the slot. A cron job releases `pending_payment` rows that are older than 15 minutes.

**Indexes:** `bookings (teacher_id, time_range)` GiST (from the constraint), `messages (conversation_id, created_at desc)`, `teacher_profiles` full-text search over name and bio with `pg_trgm` for fuzzy matching, `teacher_instruments (instrument_id)`, `bookings (learner_id, status)`.

**RLS:** deny by default on every table. Write policies per role. Learners see their own bookings and messages. Teachers see their own bookings, their students' names only for booked sessions, and their own courses. Admins are checked through the database role, never a client claim. The service role key is server-only.

---

## 11. Security

- **Auth:** Supabase Auth with `@supabase/ssr`. Session cookies are `httpOnly`, `secure` and `sameSite=lax`. Refresh the session and guard routes in the request interception layer. Confirm the Next.js 16 file convention when scaffolding. Redirects are written so they cannot loop (the target path is excluded from the guard).
- **Authorization:** RLS on every table. Server-side checks in every service. The UI only hides controls; it does not enforce access.
- **Input validation:** Zod on the client and again on the server for every mutation. File uploads are checked by content type, size, and magic bytes. Avatars are re-encoded.
- **XSS:** no `dangerouslySetInnerHTML`. Chat is plain text. Course descriptions use an allowlisted markdown renderer.
- **CSRF:** Server Actions plus `sameSite` cookies. Route handlers that mutate state verify the `Origin` header.
- **Payments:** verify webhook signatures. Prices are read from the database at booking time, never from the client. Webhooks are idempotent through `webhook_events`.
- **Video:** short-lived tokens (5–10 minutes, refreshed while connected). Grants are scoped to one room and to the role (teacher can publish and subscribe; learner has the same unless restricted by policy). No public room names.
- **Rate limits:** login, sign-up, booking creation, token issuance, chat send, uploads, reviews. Backed by Upstash Redis.
- **Headers:** a strict Content Security Policy with nonces or hashes. Allow LiveKit's WebSocket and media endpoints only. HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. `Permissions-Policy` allows `camera` and `microphone` for `self` only.
- **Secrets:** environment variables only. Service role keys, LiveKit API secrets, and payment keys never reach the client. `NEXT_PUBLIC_` is used only for public values. `.env.example` lists every variable without values.
- **Storage:** private buckets. Signed URLs expire within 5 minutes. Course video is served through the media provider's signed playback.
- **Privacy:** collect only what is needed. Log no emails, phone numbers or message bodies. Provide data export and deletion on request. Confirm the requirements of Pakistan's data-protection rules, India's DPDP Act 2023, and GDPR for any EU learners with counsel.
- **Abuse controls:** reports, blocks, chat rate limits, teacher verification, and a dispute process.
- **Admin:** MFA required for admin accounts. Every admin action is written to `admin_audit_log`.
- **Dependencies:** `npm audit` in CI, Dependabot, and a review before adding any new package.
- **Loop and resource safety:** bounded retries with backoff everywhere (reconnect, webhook processing, email). Effects in React have stable dependencies so subscriptions cannot re-subscribe in a loop. Cron jobs take a lock so overlapping runs cannot double-process.

---

## 12. Performance

| Metric | Target | How it is kept |
|---|---|---|
| LCP, public pages (mid-range Android, 4G) | under 2.5 s | Static or ISR rendering, `next/image`, `next/font`, no render-blocking scripts |
| INP | under 200 ms | Small client islands, no heavy work on the main thread, audio in an AudioWorklet |
| CLS | under 0.1 | Reserved image and video dimensions, fixed-size skeletons |
| Public-page JS (gzipped, first load) | under 120 KB | Server Components by default, client code only where interactive |
| Classroom JS on join | lazy chunk, measured in CI | Video SDK and audio engine loaded with dynamic `import()` |
| Beat timing jitter | under 5 ms | Audio-clock scheduling, no timer-driven audio |
| Tuner update cost | under 4 ms per frame | Throttled to 20–30 fps, transform-only updates |
| Teacher search, p95 | under 300 ms | Indexed queries, cursor pagination, cached listings |
| Chat delivery (same region) | under 500 ms | Realtime with per-conversation filters |

These are targets. Measure them with Vercel Speed Insights, Lighthouse CI, and an audio round-trip test harness before each release.

**Adaptive quality.** Audio uses Opus at 64–128 kbps stereo. Video simulcasts at 180p, 360p and 720p. A low-data mode turns video off by default and keeps audio and the Practice Room.

**Data.** Select only needed columns. Cursor pagination. Scoped Realtime channels. Cache teacher listings with ISR or tagged cache. Avoid N+1 queries by loading related rows in one query.

---

## 13. Design and motion

### Brand direction

The deck illustrations use warm orange, espresso brown, cream, and gold accents. The prototype derives its palette from those.

| Token | Light | Dark |
|---|---|---|
| Background | `#FFF8EE` | `#1A120D` |
| Surface | `#FFFFFF` | `#241913` |
| Ink (text) | `#2B1D14` | `#FBEFE0` |
| Muted text | `#6B5444` | `#C7B098` |
| Primary (CTAs) | `#C2410C` (contrast 5.2:1 with white) | `#F97316` |
| Accent (decorative, focus) | `#E9A93B` | `#F5C06A` |

Typography: Inter, as set in CLAUDE.md. A display face is a brand decision and is not included.

### Motion principles

1. **Purposeful.** Motion explains a change: a booking was made, a beat landed, a tuner needle moved. Decorative motion is limited to the hero.
2. **Fast.** Interactive feedback under 200 ms. Entrance sequences under 800 ms total.
3. **Physical.** Springs for interactive elements such as the needle and beat markers. Eased curves for page transitions.
4. **Respectful.** `prefers-reduced-motion` turns off looping and large movement. Information still reaches the user without animation.
5. **Cheap.** Animate `transform` and `opacity` only. Pause canvas loops when they are off-screen.

### Signature motion

- **Hero:** staggered headline reveal and a lightweight canvas waveform that pauses when off-screen.
- **Teacher cards:** staggered entrance, lift on hover, and a View Transitions shared-element animation from card avatar to profile avatar where the browser supports it.
- **Booking:** slots scale on hover and fill on selection. Confirmation draws an SVG check.
- **Practice Room:** matra markers pulse on each beat, with the sam (first beat) highlighted and tali and khali shown as distinct marks. The tuner needle uses a spring. The live indicator pulses.
- **Empty and loading states:** skeletons at fixed size, no layout shift, plus a short message explaining what happens next.

### Accessibility

- All controls keyboard operable. Practice Room keys: Space toggles the taal; arrows change tempo.
- Visible focus rings on every interactive element.
- Beat changes are not announced. Announcing every beat would be unusable. Announce taal and tempo changes only.
- Tuner readings use `aria-live="polite"` with a text status ("In tune", "Flat", "Sharp"), not colour alone.
- Teacher intro videos require captions. Auto-captions come later.

---

## 14. Payments and payouts

**Open question.** Confirm which provider can collect payments and pay teachers in each target country before any build work.

What the search found:

- Stripe's India page says Stripe services are invite-only there, and Connect payouts to Indian accounts have limits. [Stripe India support for marketplaces](https://support.stripe.com/questions/stripe-india-support-for-marketplaces)
- Stripe's cross-border payouts documentation lists India-specific supported fund flows. [Stripe cross-border payouts](https://stripe.com/docs/connect/cross-border-payouts)
- Pakistan appears in a Dribbble help article that lists Stripe Connect payout countries, but I could not confirm it on Stripe's official current list. [Dribbble: bank transfers with Stripe Connect](https://help.dribbble.com/en/articles/11062284-bank-transfers-with-stripe-connect)

**Recommended spike (Phase 0):** confirm, in writing, with each provider's sales or support team, (a) card collection from learners in the target markets, (b) payouts to teachers in Pakistan and India, and (c) the currencies supported. Candidates for payouts include Payoneer, Wise, and local rails. Decide after the spike.

---

## 15. Roadmap and exit criteria

### Phase 0: Decisions and spikes (about 1–2 weeks)
- Resolve section 17 decisions.
- Video provider spike (LiveKit vs Agora) on real mobile networks.
- Audio test: confirm the microphone constraints preserve tabla and tanpura quality, using real instruments.
- Record a tabla session for the bol library, or confirm licences.
- Payment and payout provider confirmation (section 14).
- Taal definitions reviewed by a tabla teacher.
- Legal review: teacher contracts, tax treatment, data-protection obligations.

**Exit:** signed-off architecture; provider contracts confirmed; a working spike showing acceptable audio latency and quality.

### Phase 1: MVP
- Auth, roles, profiles, teacher onboarding and admin approval.
- Availability, booking with database-level double-booking protection, payment, and email reminders.
- Text chat.
- Live class with device check and the Practice Room (four taals, tempo, speed trainer, tanpura, tuner).
- Reviews, reports, and the admin console.

**Exit:** 5 pilot teachers and 30 test bookings completed end to end. Zero double-bookings. Zero payment mismatches. Public pages meet the performance targets in section 12. Security checklist complete, with an automated baseline scan (for example OWASP ZAP) passing with no high-severity findings.

### Phase 2: Courses and growth
Course builder, video hosting, purchases, subscriptions, group classes, recordings with consent, calendar sync, WhatsApp reminders, progress dashboard.

### Phase 3: Marketplace and immersion
Instrument marketplace with escrow, digital goods store, events, community, mobile apps, and R&D spikes for AR and VR.

---

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Internet latency breaks live playing | Poor duet experience | Teacher leads; local practice engine; latency indicator; guidance on connections and headphones |
| WebRTC audio processing degrades music | Teacher cannot hear the instrument well | Processing off by default; tested with real instruments in Phase 0 |
| Payouts not available in PK or IN | Teachers cannot be paid | Provider confirmation before build; fallback rails |
| Sample licensing | Legal exposure | Record bols in-house or licence them; keep licences in `/docs` |
| Bandwidth and media costs | Margin erosion | Per-minute cost model; audio-first low-data mode; caps and monitoring |
| Teacher quality and trust | Churn, bad reviews | Verification, reviews only after completed lessons, admin review |
| No-shows, chargebacks, disputes | Revenue loss, admin load | Cancellation policy, pending-hold expiry, dispute tooling |
| Scope creep (AR/VR, NFTs, marketplace) | Delayed MVP | Phases with explicit exclusions |
| Data-protection and tax obligations | Fines, rework | Counsel review in Phase 0; data minimisation from the start |

---

## 17. Decisions needed from you

Each item includes a recommendation. Nothing is final until you confirm it.

1. **Business model.** Platform fee on bookings (percentage), any subscription tiers, and trial pricing rules. *Recommend:* a single booking commission at launch; subscriptions in Phase 2 after usage data exists.
2. **Payment and payout providers.** Confirm coverage for Pakistan and India (section 14). *Recommend:* run the spike before committing.
3. **Brand name.** MUSME, MUV, or MUS Studio. *Recommend:* MUSME, to match the deck title.
4. **Video provider.** Approve the LiveKit vs Agora spike. *Recommend:* LiveKit if its audio options hold up, for the open-source option and lower lock-in.
5. **Stack and new services.** Approve Next.js 16, Supabase, and Vercel, plus LiveKit (or Agora), Upstash Redis, and Mux or Cloudflare Stream in Phase 2. *Recommend:* approve, since these match the standards in the parent CLAUDE.md.
6. **Scope cuts.** Drop NFTs. Defer AR/VR and the Stage Simulator. *Recommend:* both.
7. **Recording in MVP.** *Recommend:* no. Add in Phase 2 with consent flows.
8. **Launch markets, languages, currency.** Which countries first, which UI languages (English first; Urdu and Hindi later?), and whether to price in USD only or in local currency.
9. **Taal library and bols.** Who records the bols, and who validates the taal definitions? *Recommend:* engage a tabla teacher as an early teacher partner and paid reviewer.
10. **Mobile.** *Recommend:* responsive web with an installable PWA first. Native apps in Phase 3.
11. **Legal review.** Teacher agreements (independent contractor terms), tax treatment, and data-protection obligations for each market.

---

## 18. Next steps

1. Review this plan and the design prototype.
2. Answer the decisions in section 17, or mark the ones you want me to decide and explain.
3. Approve Phase 0 (spikes and provider confirmations). No application code is written before that approval, per the project's architecture rules.
