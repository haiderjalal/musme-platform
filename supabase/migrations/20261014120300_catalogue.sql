-- =============================================================================
-- Instrument and music style catalogue. Reference data every environment needs,
-- including production. Idempotent: rows are keyed on slug, so re-running is safe.
--
-- Add new instruments or styles here as a new migration, or through the admin
-- console once it exists. Do not edit rows that have already shipped.
-- =============================================================================

insert into public.instruments (slug, name)
values
  ('tabla', 'Tabla'),
  ('vocal', 'Vocal'),
  ('harmonium', 'Harmonium'),
  ('sitar', 'Sitar'),
  ('guitar', 'Guitar'),
  ('piano', 'Piano'),
  ('violin', 'Violin'),
  ('drums', 'Drums'),
  ('dj', 'DJ')
on conflict (slug) do nothing;

insert into public.music_styles (slug, name)
values
  ('hindustani-classical', 'Hindustani classical'),
  ('qawwali', 'Qawwali'),
  ('bhajan', 'Bhajan'),
  ('blues', 'Blues'),
  ('jazz', 'Jazz'),
  ('electronic', 'Electronic')
on conflict (slug) do nothing;
