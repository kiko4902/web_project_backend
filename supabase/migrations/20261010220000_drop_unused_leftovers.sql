-- Removes three objects nothing uses any more. Each was checked against the
-- API code and against pg_depend (no views, policies, triggers or functions
-- reference them).

-- Workaround helper from the first version of the API, which probed for
-- columns at runtime. The API no longer calls it.
drop function if exists public.column_exists(text, text);

-- Denormalised copy of the reviewer's name that drifted from the real
-- profile. Usernames are read from user_profiles through the user_id link.
alter table public.reviews drop column if exists username;

-- Same columns in the same order as the primary key movie_genres_pkey.
drop index if exists public.idx_movie_genres;
