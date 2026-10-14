-- MUSME platform foundation: helper functions, row level security and grants.
--
-- Model (see docs/database.md)
--   * RLS is enabled on every table. A table with no policy is inaccessible.
--   * anon and authenticated start with no privileges. Only what each role needs is granted back.
--   * Column-level grants protect fields the client must never write
--     (profiles.role, teacher verification fields, reports resolution, review visibility).
--   * Writes that move money or change booking state happen only through the service
--     role after server-side checks. Bookings, payments and webhook_events have no client write grants.
--   * Helper functions use search_path = '' and fully qualified names. Security definer
--     helpers read through RLS-free paths, so policies never recurse into themselves.
--
-- Idempotent: functions use create or replace, policies are dropped before they are created.

-- Helper functions ------------------------------------------------------------

-- True when the calling user is an active admin. The admin role is read from the
-- database, never from a client claim.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deleted_at is null
  );
$$;

-- True when the teacher is approved and their profile is not soft-deleted.
-- Used by public read policies, which cannot read profiles directly.
create or replace function public.is_approved_teacher(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_profiles as tp
    join public.profiles as p on p.id = tp.profile_id
    where tp.profile_id = p_teacher_id
      and tp.verification_status = 'approved'
      and p.deleted_at is null
  );
$$;

-- Chat is allowed only between the two people in a conversation, and only when
-- they have a booking together that is not cancelled. The caller must be one of the pair.
create or replace function public.has_chat_booking(p_learner_id uuid, p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() in (p_learner_id, p_teacher_id)
    and exists (
      select 1
      from public.bookings as b
      where b.learner_id = p_learner_id
        and b.teacher_id = p_teacher_id
        and b.status <> 'cancelled'
    );
$$;

-- Busy windows for a teacher, for the booking calendar. Returns only time bounds.
-- No learner, booking or exception identifiers are exposed.
create or replace function public.teacher_busy_ranges(
  p_teacher_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid time window' using errcode = '22023';
  end if;

  return query
  select b.starts_at, b.ends_at
  from public.bookings as b
  where b.teacher_id = p_teacher_id
    and b.status in ('pending_payment', 'confirmed', 'in_progress')
    and b.time_range && tstzrange(p_from, p_to, '[)')
  union all
  select e.starts_at, e.ends_at
  from public.availability_exceptions as e
  where e.teacher_id = p_teacher_id
    and e.kind = 'blocked'
    and tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
  order by 1;
end;
$$;

-- A teacher resubmits an application after a rejection, or submits the first time.
-- This is the only way a teacher changes verification_status. Clients cannot write
-- that column directly.
create or replace function public.submit_teacher_application()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.verification_status;
begin
  select tp.verification_status
  into v_status
  from public.teacher_profiles as tp
  where tp.profile_id = auth.uid()
  for update;

  if not found then
    raise exception 'No teacher application found' using errcode = 'P0002';
  end if;

  if v_status not in ('rejected', 'submitted') then
    raise exception 'An application cannot be submitted while its status is %', v_status
      using errcode = '55000';
  end if;

  update public.teacher_profiles
  set verification_status = 'submitted',
      rejection_reason = null
  where profile_id = auth.uid();
end;
$$;

-- Admin decision on a teacher application. Writes the audit row in the same
-- transaction as the status change. Admins call this function; no admin column grant exists.
create or replace function public.admin_review_teacher(
  p_teacher_id uuid,
  p_status public.verification_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.verification_status;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can review teachers' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'Unsupported review decision: %', p_status using errcode = '22023';
  end if;

  if p_status in ('rejected', 'suspended') and v_reason is null then
    raise exception 'A reason is required to reject or suspend a teacher' using errcode = '22023';
  end if;

  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Review reason is too long' using errcode = '22023';
  end if;

  select tp.verification_status
  into v_previous
  from public.teacher_profiles as tp
  where tp.profile_id = p_teacher_id
  for update;

  if not found then
    raise exception 'Teacher not found' using errcode = 'P0002';
  end if;

  update public.teacher_profiles
  set verification_status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_status = 'approved' then null else v_reason end
  where profile_id = p_teacher_id;

  -- Approval is what makes someone a teacher. Rejection or suspension returns them to the
  -- learner role. Admin accounts are never changed here.
  update public.profiles
  set role = case when p_status = 'approved' then 'teacher'::public.user_role else 'learner'::public.user_role end
  where id = p_teacher_id
    and role in ('learner', 'teacher');

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'teacher.review',
    'teacher_profile',
    p_teacher_id,
    jsonb_build_object('from', v_previous, 'to', p_status, 'reason', v_reason)
  );
end;
$$;

-- Function privileges. Functions are executable by PUBLIC by default, so revoke
-- everything first and grant back only what each caller needs.
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_approved_teacher(uuid) from public, anon, authenticated;
revoke all on function public.has_chat_booking(uuid, uuid) from public, anon, authenticated;
revoke all on function public.teacher_busy_ranges(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.submit_teacher_application() from public, anon, authenticated;
revoke all on function public.admin_review_teacher(uuid, public.verification_status, text) from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved_teacher(uuid) to anon, authenticated;
grant execute on function public.has_chat_booking(uuid, uuid) to authenticated;
grant execute on function public.teacher_busy_ranges(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.submit_teacher_application() to authenticated;
grant execute on function public.admin_review_teacher(uuid, public.verification_status, text) to authenticated;

-- New functions created later must not inherit PUBLIC execute by default.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Enable RLS on every table ---------------------------------------------------

alter table public.profiles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.instruments enable row level security;
alter table public.music_styles enable row level security;
alter table public.teacher_instruments enable row level security;
alter table public.teacher_styles enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.lesson_offerings enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.platform_settings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.courses enable row level security;
alter table public.course_lessons enable row level security;
alter table public.reviews enable row level security;
alter table public.lesson_notes enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_log enable row level security;

-- Table privileges ------------------------------------------------------------

-- Strip the Supabase default grants from anon and authenticated, then grant back.
revoke all on all tables in schema public from anon, authenticated;

-- Future tables must not receive default grants to client roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- anon: public catalogue reads only. RLS limits rows further.
grant select on
  public.teacher_profiles,
  public.instruments,
  public.music_styles,
  public.teacher_instruments,
  public.teacher_styles,
  public.lesson_offerings,
  public.courses,
  public.course_lessons,
  public.reviews
to anon;

-- anon reads public teacher identity only. Column-level, so role, timestamps and
-- deleted_at never reach signed-out visitors. Rows are limited to approved teachers by policy.
grant select (id, display_name, timezone, language, country, avatar_path) on public.profiles to anon;

-- authenticated: each table gets only the commands its policies allow.

-- profiles: no insert or delete (the auth trigger creates rows). Role is never writable.
-- Table-level select is safe here: profiles holds no email or contact details (email lives in auth.users).
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, country, timezone, language) on public.profiles to authenticated;

-- teacher_profiles: verification fields are not writable. slug is set once at application.
grant select on public.teacher_profiles to authenticated;
grant insert (profile_id, slug, headline, bio, intro_video_path, languages) on public.teacher_profiles to authenticated;
grant update (headline, bio, intro_video_path, languages) on public.teacher_profiles to authenticated;

-- Catalogue: reads for everyone, writes for admins (enforced by policy).
grant select, insert, update, delete on public.instruments, public.music_styles to authenticated;

grant select, insert, delete on public.teacher_instruments, public.teacher_styles to authenticated;

grant select, insert, update, delete on public.availability_rules, public.availability_exceptions to authenticated;

grant select, insert, update, delete on public.lesson_offerings to authenticated;

-- bookings: read only. Writes go through the service role after app checks.
grant select on public.bookings to authenticated;

-- payments and platform settings: read only. Writes are service-only.
grant select on public.payments, public.platform_settings to authenticated;

-- webhook_events: no client privileges at all.

-- conversations: a learner opens a thread for a pair that has a booking.
grant select on public.conversations to authenticated;
grant insert (learner_id, teacher_id) on public.conversations to authenticated;

-- messages: no update or delete. Soft delete is a service-side action.
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body, attachment_path) on public.messages to authenticated;

-- courses and lessons: owners manage their own. Publishing is guarded by trigger.
grant select, insert, update on public.courses to authenticated;
grant select, insert, update, delete on public.course_lessons to authenticated;

-- reviews: immutable once posted (no update or delete). is_visible is moderated by service.
grant select on public.reviews to authenticated;
grant insert (booking_id, learner_id, teacher_id, rating, body) on public.reviews to authenticated;

-- lesson notes: teacher manages; learner reads. Only the body is editable.
grant select, insert, delete on public.lesson_notes to authenticated;
grant update (body) on public.lesson_notes to authenticated;

grant select, insert on public.practice_sessions to authenticated;

-- reports: the reporter sets only the fields they provide. Resolution is service-only.
grant select on public.reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason) on public.reports to authenticated;

-- notifications: read own, and mark as read. Nothing else.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- admin_audit_log: admins read and append. No update or delete (also blocked by trigger).
grant select, insert on public.admin_audit_log to authenticated;

-- Policies --------------------------------------------------------------------

-- profiles ---------------------------------------------------------------------

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Public teacher pages and listings need the teacher's display name, timezone and avatar.
-- Only approved, non-deleted teachers are readable by anon.
drop policy if exists profiles_select_public_teacher on public.profiles;
create policy profiles_select_public_teacher on public.profiles
  for select to anon, authenticated
  using (public.is_approved_teacher(id));

-- Booking and chat counterparts can read each other's identity (for example, a teacher
-- seeing a learner's name). Either direction, and only when a booking or conversation
-- connects the two. The subqueries run under the caller's RLS, so they only see rows
-- where the caller is a participant.
drop policy if exists profiles_select_counterpart on public.profiles;
create policy profiles_select_counterpart on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings as b
      where (b.learner_id = auth.uid() and b.teacher_id = profiles.id)
         or (b.teacher_id = auth.uid() and b.learner_id = profiles.id)
    )
    or exists (
      select 1
      from public.conversations as c
      where (c.learner_id = auth.uid() and c.teacher_id = profiles.id)
         or (c.teacher_id = auth.uid() and c.learner_id = profiles.id)
    )
  );

-- teacher_profiles -------------------------------------------------------------

drop policy if exists teacher_profiles_select_approved on public.teacher_profiles;
create policy teacher_profiles_select_approved on public.teacher_profiles
  for select to anon, authenticated
  using (public.is_approved_teacher(profile_id));

drop policy if exists teacher_profiles_select_own_or_admin on public.teacher_profiles;
create policy teacher_profiles_select_own_or_admin on public.teacher_profiles
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists teacher_profiles_insert_own on public.teacher_profiles;
create policy teacher_profiles_insert_own on public.teacher_profiles
  for insert to authenticated
  with check (profile_id = auth.uid() and verification_status = 'submitted');

drop policy if exists teacher_profiles_update_own on public.teacher_profiles;
create policy teacher_profiles_update_own on public.teacher_profiles
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- instruments and music_styles -------------------------------------------------

drop policy if exists instruments_select_all on public.instruments;
create policy instruments_select_all on public.instruments
  for select to anon, authenticated
  using (true);

drop policy if exists instruments_admin_insert on public.instruments;
create policy instruments_admin_insert on public.instruments
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists instruments_admin_update on public.instruments;
create policy instruments_admin_update on public.instruments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists instruments_admin_delete on public.instruments;
create policy instruments_admin_delete on public.instruments
  for delete to authenticated
  using (public.is_admin());

drop policy if exists music_styles_select_all on public.music_styles;
create policy music_styles_select_all on public.music_styles
  for select to anon, authenticated
  using (true);

drop policy if exists music_styles_admin_insert on public.music_styles;
create policy music_styles_admin_insert on public.music_styles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists music_styles_admin_update on public.music_styles;
create policy music_styles_admin_update on public.music_styles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists music_styles_admin_delete on public.music_styles;
create policy music_styles_admin_delete on public.music_styles
  for delete to authenticated
  using (public.is_admin());

-- teacher_instruments and teacher_styles ---------------------------------------

drop policy if exists teacher_instruments_select_approved on public.teacher_instruments;
create policy teacher_instruments_select_approved on public.teacher_instruments
  for select to anon, authenticated
  using (public.is_approved_teacher(teacher_id));

drop policy if exists teacher_instruments_select_own_or_admin on public.teacher_instruments;
create policy teacher_instruments_select_own_or_admin on public.teacher_instruments
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists teacher_instruments_insert_own on public.teacher_instruments;
create policy teacher_instruments_insert_own on public.teacher_instruments
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists teacher_instruments_delete_own on public.teacher_instruments;
create policy teacher_instruments_delete_own on public.teacher_instruments
  for delete to authenticated
  using (teacher_id = auth.uid());

drop policy if exists teacher_styles_select_approved on public.teacher_styles;
create policy teacher_styles_select_approved on public.teacher_styles
  for select to anon, authenticated
  using (public.is_approved_teacher(teacher_id));

drop policy if exists teacher_styles_select_own_or_admin on public.teacher_styles;
create policy teacher_styles_select_own_or_admin on public.teacher_styles
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists teacher_styles_insert_own on public.teacher_styles;
create policy teacher_styles_insert_own on public.teacher_styles
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists teacher_styles_delete_own on public.teacher_styles;
create policy teacher_styles_delete_own on public.teacher_styles
  for delete to authenticated
  using (teacher_id = auth.uid());

-- availability_rules and availability_exceptions -------------------------------
-- Learners never read these tables. They use teacher_busy_ranges().

drop policy if exists availability_rules_select_own_or_admin on public.availability_rules;
create policy availability_rules_select_own_or_admin on public.availability_rules
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists availability_rules_insert_own on public.availability_rules;
create policy availability_rules_insert_own on public.availability_rules
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists availability_rules_update_own on public.availability_rules;
create policy availability_rules_update_own on public.availability_rules
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists availability_rules_delete_own on public.availability_rules;
create policy availability_rules_delete_own on public.availability_rules
  for delete to authenticated
  using (teacher_id = auth.uid());

drop policy if exists availability_exceptions_select_own_or_admin on public.availability_exceptions;
create policy availability_exceptions_select_own_or_admin on public.availability_exceptions
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists availability_exceptions_insert_own on public.availability_exceptions;
create policy availability_exceptions_insert_own on public.availability_exceptions
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists availability_exceptions_update_own on public.availability_exceptions;
create policy availability_exceptions_update_own on public.availability_exceptions
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists availability_exceptions_delete_own on public.availability_exceptions;
create policy availability_exceptions_delete_own on public.availability_exceptions
  for delete to authenticated
  using (teacher_id = auth.uid());

-- lesson_offerings -------------------------------------------------------------

drop policy if exists lesson_offerings_select_active_approved on public.lesson_offerings;
create policy lesson_offerings_select_active_approved on public.lesson_offerings
  for select to anon, authenticated
  using (is_active and public.is_approved_teacher(teacher_id));

drop policy if exists lesson_offerings_select_own_or_admin on public.lesson_offerings;
create policy lesson_offerings_select_own_or_admin on public.lesson_offerings
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists lesson_offerings_insert_own on public.lesson_offerings;
create policy lesson_offerings_insert_own on public.lesson_offerings
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists lesson_offerings_update_own on public.lesson_offerings;
create policy lesson_offerings_update_own on public.lesson_offerings
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists lesson_offerings_delete_own on public.lesson_offerings;
create policy lesson_offerings_delete_own on public.lesson_offerings
  for delete to authenticated
  using (teacher_id = auth.uid());

-- bookings: read only. No insert, update or delete policy exists by design. -----

drop policy if exists bookings_select_participant_or_admin on public.bookings;
create policy bookings_select_participant_or_admin on public.bookings
  for select to authenticated
  using (learner_id = auth.uid() or teacher_id = auth.uid() or public.is_admin());

-- payments: read only for the two participants and admins. ---------------------

drop policy if exists payments_select_participant_or_admin on public.payments;
create policy payments_select_participant_or_admin on public.payments
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.bookings as b
      where b.id = payments.booking_id
        and (b.learner_id = auth.uid() or b.teacher_id = auth.uid())
    )
  );

-- webhook_events: RLS is on and no policy exists, so no client access. -----------

-- platform_settings: admins read. Writes are service-only.

drop policy if exists platform_settings_select_admin on public.platform_settings;
create policy platform_settings_select_admin on public.platform_settings
  for select to authenticated
  using (public.is_admin());

-- conversations ----------------------------------------------------------------

drop policy if exists conversations_select_participant_or_admin on public.conversations;
create policy conversations_select_participant_or_admin on public.conversations
  for select to authenticated
  using (auth.uid() in (learner_id, teacher_id) or public.is_admin());

drop policy if exists conversations_insert_learner_with_booking on public.conversations;
create policy conversations_insert_learner_with_booking on public.conversations
  for insert to authenticated
  with check (learner_id = auth.uid() and public.has_chat_booking(learner_id, teacher_id));

-- messages ---------------------------------------------------------------------

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.conversations as c
      where c.id = messages.conversation_id
        and auth.uid() in (c.learner_id, c.teacher_id)
    )
  );

drop policy if exists messages_select_admin on public.messages;
create policy messages_select_admin on public.messages
  for select to authenticated
  using (public.is_admin());

drop policy if exists messages_insert_participant_with_booking on public.messages;
create policy messages_insert_participant_with_booking on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.conversations as c
      where c.id = messages.conversation_id
        and auth.uid() in (c.learner_id, c.teacher_id)
        and public.has_chat_booking(c.learner_id, c.teacher_id)
    )
  );

-- courses ----------------------------------------------------------------------

drop policy if exists courses_select_published_approved on public.courses;
create policy courses_select_published_approved on public.courses
  for select to anon, authenticated
  using (status = 'published' and public.is_approved_teacher(teacher_id));

drop policy if exists courses_select_owner_or_admin on public.courses;
create policy courses_select_owner_or_admin on public.courses
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists courses_insert_owner on public.courses;
create policy courses_insert_owner on public.courses
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists courses_update_owner on public.courses;
create policy courses_update_owner on public.courses
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- course_lessons follow the parent course. If the caller can see the course, they can see its lessons.

drop policy if exists course_lessons_select_follow_course on public.course_lessons;
create policy course_lessons_select_follow_course on public.course_lessons
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.courses as c
      where c.id = course_lessons.course_id
    )
  );

drop policy if exists course_lessons_insert_owner on public.course_lessons;
create policy course_lessons_insert_owner on public.course_lessons
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.courses as c
      where c.id = course_lessons.course_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists course_lessons_update_owner on public.course_lessons;
create policy course_lessons_update_owner on public.course_lessons
  for update to authenticated
  using (
    exists (
      select 1
      from public.courses as c
      where c.id = course_lessons.course_id
        and c.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.courses as c
      where c.id = course_lessons.course_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists course_lessons_delete_owner on public.course_lessons;
create policy course_lessons_delete_owner on public.course_lessons
  for delete to authenticated
  using (
    exists (
      select 1
      from public.courses as c
      where c.id = course_lessons.course_id
        and c.teacher_id = auth.uid()
    )
  );

-- reviews ----------------------------------------------------------------------

drop policy if exists reviews_select_visible on public.reviews;
create policy reviews_select_visible on public.reviews
  for select to anon, authenticated
  using (is_visible);

drop policy if exists reviews_select_admin on public.reviews;
create policy reviews_select_admin on public.reviews
  for select to authenticated
  using (public.is_admin());

drop policy if exists reviews_insert_learner_completed on public.reviews;
create policy reviews_insert_learner_completed on public.reviews
  for insert to authenticated
  with check (
    learner_id = auth.uid()
    and exists (
      select 1
      from public.bookings as b
      where b.id = reviews.booking_id
        and b.learner_id = auth.uid()
        and b.status = 'completed'
    )
  );

-- lesson_notes -----------------------------------------------------------------

drop policy if exists lesson_notes_select_teacher on public.lesson_notes;
create policy lesson_notes_select_teacher on public.lesson_notes
  for select to authenticated
  using (teacher_id = auth.uid());

drop policy if exists lesson_notes_select_learner on public.lesson_notes;
create policy lesson_notes_select_learner on public.lesson_notes
  for select to authenticated
  using (learner_id = auth.uid());

drop policy if exists lesson_notes_insert_teacher on public.lesson_notes;
create policy lesson_notes_insert_teacher on public.lesson_notes
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists lesson_notes_update_teacher on public.lesson_notes;
create policy lesson_notes_update_teacher on public.lesson_notes
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists lesson_notes_delete_teacher on public.lesson_notes;
create policy lesson_notes_delete_teacher on public.lesson_notes
  for delete to authenticated
  using (teacher_id = auth.uid());

-- practice_sessions ------------------------------------------------------------

drop policy if exists practice_sessions_select_own on public.practice_sessions;
create policy practice_sessions_select_own on public.practice_sessions
  for select to authenticated
  using (learner_id = auth.uid());

drop policy if exists practice_sessions_insert_own on public.practice_sessions;
create policy practice_sessions_insert_own on public.practice_sessions
  for insert to authenticated
  with check (learner_id = auth.uid());

-- reports ----------------------------------------------------------------------

drop policy if exists reports_select_own_or_admin on public.reports;
create policy reports_select_own_or_admin on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- notifications ----------------------------------------------------------------

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- admin_audit_log: admins read and append. Update and delete are blocked by trigger. ---

drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

drop policy if exists admin_audit_log_insert_admin on public.admin_audit_log;
create policy admin_audit_log_insert_admin on public.admin_audit_log
  for insert to authenticated
  with check (actor_id = auth.uid() and public.is_admin());
