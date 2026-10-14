-- MUSME platform foundation: triggers and database-level business rules.
--
-- Idempotent: functions use create or replace, triggers use create or replace trigger.

-- updated_at -------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create or replace trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace trigger teacher_profiles_set_updated_at
  before update on public.teacher_profiles
  for each row execute function public.set_updated_at();

create or replace trigger instruments_set_updated_at
  before update on public.instruments
  for each row execute function public.set_updated_at();

create or replace trigger music_styles_set_updated_at
  before update on public.music_styles
  for each row execute function public.set_updated_at();

create or replace trigger availability_rules_set_updated_at
  before update on public.availability_rules
  for each row execute function public.set_updated_at();

create or replace trigger availability_exceptions_set_updated_at
  before update on public.availability_exceptions
  for each row execute function public.set_updated_at();

create or replace trigger lesson_offerings_set_updated_at
  before update on public.lesson_offerings
  for each row execute function public.set_updated_at();

create or replace trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create or replace trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create or replace trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

create or replace trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create or replace trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create or replace trigger course_lessons_set_updated_at
  before update on public.course_lessons
  for each row execute function public.set_updated_at();

create or replace trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create or replace trigger lesson_notes_set_updated_at
  before update on public.lesson_notes
  for each row execute function public.set_updated_at();

create or replace trigger practice_sessions_set_updated_at
  before update on public.practice_sessions
  for each row execute function public.set_updated_at();

create or replace trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create or replace trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- New auth user -> profile -----------------------------------------------------

-- Creates the learner profile for every new auth user.
-- The role is always 'learner'. Never read role from raw_user_meta_data or
-- raw_app_meta_data: user metadata is set by the client, so trusting it would allow
-- self-promotion to admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'learner',
    left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 80)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Booking insert rules ---------------------------------------------------------

-- Enforces, on insert:
--   1. The booking starts in the future (checked against the database clock).
--   2. The booking length matches the offering's duration. Duration is a fact about
--      the offering, so a client cannot shorten or stretch a lesson.
-- Security definer lets the check read the offering even when RLS hides it
-- (for example, an inactive offering), so the length check cannot be bypassed by visibility.
create or replace function public.enforce_booking_insert_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration_minutes integer;
begin
  if new.starts_at <= now() then
    raise exception 'Bookings must start in the future' using errcode = '23514';
  end if;

  select o.duration_minutes
  into v_duration_minutes
  from public.lesson_offerings as o
  where o.id = new.offering_id;

  if v_duration_minutes is null
    or new.ends_at - new.starts_at <> make_interval(mins => v_duration_minutes) then
    raise exception 'Booking length must match the lesson offering' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_booking_insert_rules() from public, anon, authenticated;

create or replace trigger bookings_enforce_insert_rules
  before insert on public.bookings
  for each row execute function public.enforce_booking_insert_rules();

-- Append-only audit log --------------------------------------------------------

-- Blocks update, delete and truncate for every role, including the owner and service role.
create or replace function public.prevent_admin_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '42501';
end;
$$;

revoke all on function public.prevent_admin_audit_log_mutation() from public, anon, authenticated;

create or replace trigger admin_audit_log_block_update_delete
  before update or delete on public.admin_audit_log
  for each row execute function public.prevent_admin_audit_log_mutation();

create or replace trigger admin_audit_log_block_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.prevent_admin_audit_log_mutation();

-- Course publishing ------------------------------------------------------------

-- Only admins can move a course to published. Teachers can save drafts and request review.
-- Writes with no JWT subject (service role) are trusted server code and pass through.
create or replace function public.enforce_course_publish_rights()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  raise exception 'Only admins can publish courses' using errcode = '42501';
end;
$$;

revoke all on function public.enforce_course_publish_rights() from public, anon, authenticated;

create or replace trigger courses_enforce_publish_rights
  before insert or update on public.courses
  for each row execute function public.enforce_course_publish_rights();

-- Realtime ---------------------------------------------------------------------

-- Chat subscribes to postgres_changes on public.messages, filtered by conversation_id.
-- Realtime delivers only rows the subscriber's RLS select policy allows.
-- Guarded: PGlite and plain Postgres have no supabase_realtime publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
