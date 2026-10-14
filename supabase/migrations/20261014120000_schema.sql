-- MUSME platform foundation: schema.
--
-- Enums, tables, constraints and indexes from docs/product-plan.md section 10.
--
-- Conventions
--   * uuid primary keys (gen_random_uuid()), snake_case names, timestamptz in UTC.
--   * Money is integer minor units plus an ISO 4217 currency code. Never floats.
--   * Mutable tables carry updated_at (set by a trigger in 20261014120200_triggers.sql).
--   * Append-only and join tables carry created_at only.
--
-- Access control lives in 20261014120100_security.sql. Triggers and business
-- rules live in 20261014120200_triggers.sql. See docs/database.md.
--
-- Idempotent: every statement can be re-run safely.

create extension if not exists btree_gist;
create extension if not exists pg_trgm;

-- Enums -----------------------------------------------------------------------

do $$
begin
  create type public.user_role as enum ('learner', 'teacher', 'admin');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.verification_status as enum ('submitted', 'approved', 'rejected', 'suspended');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.booking_status as enum (
    'pending_payment',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
    'refunded',
    'expired'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.course_status as enum ('draft', 'review', 'published', 'archived');
exception
  when duplicate_object then null;
end
$$;

-- Identity and teachers -------------------------------------------------------

create table if not exists public.profiles (
  -- One row per auth user. Created by the auth.users trigger, never by clients.
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'learner',
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 512),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  -- IANA zone name. Validated by the Zod layer; the database checks length only.
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  language text check (language is null or char_length(language) between 2 and 35),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.teacher_profiles (
  profile_id uuid primary key references public.profiles (id),
  -- Set when the teacher applies. Used in readable public URLs (/teachers/<slug>).
  -- Not client-updatable, so public URLs stay stable.
  slug text not null unique check (
    char_length(slug) between 3 and 80
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  headline text check (headline is null or char_length(headline) between 1 and 120),
  bio text check (bio is null or char_length(bio) <= 2000),
  verification_status public.verification_status not null default 'submitted',
  intro_video_path text check (intro_video_path is null or char_length(intro_video_path) <= 512),
  languages text[] not null default '{}',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Every decision after submission has a review trail.
  constraint teacher_profiles_review_trail
    check (verification_status = 'submitted' or reviewed_at is not null),
  -- Rejected and suspended teachers always carry a reason.
  constraint teacher_profiles_reason_required
    check (verification_status not in ('rejected', 'suspended') or rejection_reason is not null)
);

-- Catalogue -------------------------------------------------------------------

create table if not exists public.instruments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 1 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_styles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 1 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_instruments (
  teacher_id uuid not null references public.teacher_profiles (profile_id) on delete cascade,
  instrument_id uuid not null references public.instruments (id),
  created_at timestamptz not null default now(),
  primary key (teacher_id, instrument_id)
);

create table if not exists public.teacher_styles (
  teacher_id uuid not null references public.teacher_profiles (profile_id) on delete cascade,
  music_style_id uuid not null references public.music_styles (id),
  created_at timestamptz not null default now(),
  primary key (teacher_id, music_style_id)
);

-- Availability and offerings --------------------------------------------------

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (profile_id) on delete cascade,
  -- 0 = Sunday ... 6 = Saturday (PostgreSQL EXTRACT(DOW) convention).
  weekday smallint not null check (weekday between 0 and 6),
  -- Local times in the teacher's timezone (profiles.timezone). Windows cannot cross midnight.
  start_local_time time not null,
  end_local_time time not null,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_rules_time_order check (end_local_time > start_local_time),
  constraint availability_rules_valid_range
    check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (profile_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null check (kind in ('blocked', 'extra')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_exceptions_time_order check (ends_at > starts_at)
);

create table if not exists public.lesson_offerings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (profile_id),
  title text not null check (char_length(title) between 1 and 120),
  duration_minutes integer not null check (duration_minutes in (30, 45, 60)),
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  is_trial boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets bookings prove that the offering belongs to the booked teacher.
  constraint lesson_offerings_id_teacher_key unique (id, teacher_id)
);

-- Bookings and payments -------------------------------------------------------

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles (id),
  teacher_id uuid not null references public.teacher_profiles (profile_id),
  offering_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Half-open range so back-to-back lessons do not overlap.
  time_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status public.booking_status not null default 'pending_payment',
  -- Snapshotted at booking time. Clients never supply these.
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  fee_minor integer not null default 0 check (fee_minor >= 0),
  idempotency_key uuid not null,
  -- Set while the booking is pending_payment. A cron job releases expired holds.
  hold_expires_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_time_order check (ends_at > starts_at),
  constraint bookings_fee_within_price check (fee_minor <= price_minor),
  constraint bookings_not_self check (learner_id <> teacher_id),
  constraint bookings_hold_for_pending
    check (status <> 'pending_payment' or hold_expires_at is not null),
  constraint bookings_cancelled_at_for_cancelled
    check (status <> 'cancelled' or cancelled_at is not null),

  -- The offering must belong to the same teacher.
  constraint bookings_offering_teacher_fk
    foreign key (offering_id, teacher_id) references public.lesson_offerings (id, teacher_id),

  -- Idempotent booking creation: a retried request cannot create a second booking.
  constraint bookings_learner_idempotency_key unique (learner_id, idempotency_key),

  -- Composite keys so reviews, notes and practice logs can prove ownership.
  constraint bookings_id_learner_key unique (id, learner_id),
  constraint bookings_id_learner_teacher_key unique (id, learner_id, teacher_id),

  -- Double-booking guard. Pending holds block a slot; cancelled and completed do not.
  constraint bookings_no_overlap exclude using gist (
    teacher_id with =,
    time_range with &&
  ) where (status in ('pending_payment', 'confirmed', 'in_progress'))
);

create index if not exists bookings_learner_status_idx on public.bookings (learner_id, status);
create index if not exists bookings_offering_id_idx on public.bookings (offering_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  provider text not null check (char_length(provider) between 1 and 50),
  provider_ref text not null unique check (char_length(provider_ref) between 1 and 255),
  amount_minor integer not null check (amount_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_booking_id_idx on public.payments (booking_id);

-- Provider event ids. The provider's event id is the primary key, which makes
-- webhook processing idempotent. Clients have no access.
create table if not exists public.webhook_events (
  id text primary key check (char_length(id) between 1 and 255),
  provider text not null check (char_length(provider) between 1 and 50),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Singleton settings row. See the comment on platform_fee_bps below.
create table if not exists public.platform_settings (
  singleton boolean primary key default true check (singleton),
  platform_fee_bps integer not null default 0 check (platform_fee_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.platform_settings.platform_fee_bps is
  'PLACEHOLDER: 0 basis points until the platform fee is decided (product plan section 17, item 1).';

insert into public.platform_settings (singleton)
values (true)
on conflict (singleton) do nothing;

-- Chat ------------------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles (id),
  teacher_id uuid not null references public.teacher_profiles (profile_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_learner_teacher_key unique (learner_id, teacher_id),
  constraint conversations_not_self check (learner_id <> teacher_id)
);

create index if not exists conversations_teacher_id_idx on public.conversations (teacher_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id),
  sender_id uuid not null references public.profiles (id),
  -- Plain text, 1 to 2000 characters. Whitespace-only bodies are rejected.
  body text not null check (char_length(body) between 1 and 2000 and btrim(body) <> ''),
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 512),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- Courses ---------------------------------------------------------------------

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (profile_id),
  slug text not null check (char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status public.course_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_teacher_slug_key unique (teacher_id, slug)
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 200),
  media_path text check (media_path is null or char_length(media_path) <= 512),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so lessons can be reordered inside one transaction.
  constraint course_lessons_course_position_key unique (course_id, position) deferrable initially immediate
);

-- Reviews, notes and practice -------------------------------------------------

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  learner_id uuid not null references public.profiles (id),
  teacher_id uuid not null references public.teacher_profiles (profile_id),
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) between 1 and 2000),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per booking.
  constraint reviews_booking_key unique (booking_id),
  -- The learner and teacher must match the booking.
  constraint reviews_booking_fk
    foreign key (booking_id, learner_id, teacher_id) references public.bookings (id, learner_id, teacher_id)
);

create index if not exists reviews_teacher_visible_idx
  on public.reviews (teacher_id)
  where is_visible;

create table if not exists public.lesson_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  teacher_id uuid not null references public.teacher_profiles (profile_id),
  learner_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_notes_booking_fk
    foreign key (booking_id, learner_id, teacher_id) references public.bookings (id, learner_id, teacher_id)
);

create index if not exists lesson_notes_learner_idx on public.lesson_notes (learner_id, created_at desc);
create index if not exists lesson_notes_teacher_idx on public.lesson_notes (teacher_id, created_at desc);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles (id),
  -- Optional. When set, the booking must belong to the same learner (MATCH SIMPLE skips the check when null).
  booking_id uuid,
  started_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  -- Taal definitions live in code (constants), so this is a slug, not a foreign key.
  taal_slug text not null check (char_length(taal_slug) between 1 and 60 and taal_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tempo_bpm smallint not null check (tempo_bpm between 20 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_sessions_booking_fk
    foreign key (booking_id, learner_id) references public.bookings (id, learner_id)
);

create index if not exists practice_sessions_learner_started_idx
  on public.practice_sessions (learner_id, started_at desc);

-- Moderation, notifications and audit -----------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  -- Polymorphic target, so there is no foreign key on target_id.
  target_type text not null check (target_type in ('profile', 'message', 'review', 'course')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A report has a resolution time if and only if it is no longer open.
  constraint reports_resolution_trail check ((status = 'open') = (resolved_at is null))
);

create index if not exists reports_status_created_idx on public.reports (status, created_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  type text not null check (char_length(type) between 1 and 64),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- Append-only. Update and delete are blocked by trigger in 20261014120200_triggers.sql.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  action text not null check (char_length(action) between 1 and 100),
  target_type text not null check (char_length(target_type) between 1 and 100),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_id_idx on public.admin_audit_log (actor_id);

-- Trigram indexes for fuzzy teacher search (product plan section 10) --------

create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name gin_trgm_ops);

create index if not exists teacher_profiles_bio_trgm_idx
  on public.teacher_profiles using gin (bio gin_trgm_ops);

create index if not exists teacher_instruments_instrument_id_idx
  on public.teacher_instruments (instrument_id);

create index if not exists teacher_styles_music_style_id_idx
  on public.teacher_styles (music_style_id);

create index if not exists availability_rules_teacher_weekday_idx
  on public.availability_rules (teacher_id, weekday);

create index if not exists availability_exceptions_teacher_starts_idx
  on public.availability_exceptions (teacher_id, starts_at);

create index if not exists lesson_offerings_teacher_id_idx
  on public.lesson_offerings (teacher_id);
