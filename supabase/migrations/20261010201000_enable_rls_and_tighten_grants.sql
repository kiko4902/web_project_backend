-- Enable RLS everywhere and replace the blanket table grants with the minimum
-- each role needs. Catalog tables are read-only to clients; user-owned tables
-- are writable only by their owner, and only in the columns a client may set.

alter table public.movies         enable row level security;
alter table public.genres         enable row level security;
alter table public.movie_genres   enable row level security;
alter table public.reviews        enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.user_profiles  enable row level security;

-- Catalog: public read (movies already has its read policy from the baseline).
create policy "Genres are publicly readable" on public.genres
    for select to anon, authenticated using (true);

create policy "Movie genres are publicly readable" on public.movie_genres
    for select to anon, authenticated using (true);

-- Reviews: public read, owner-only writes.
create policy "Reviews are publicly readable" on public.reviews
    for select to anon, authenticated using (true);

create policy "Users can add their own reviews" on public.reviews
    for insert to authenticated
    with check (user_id = (select auth.uid()));

create policy "Users can edit their own reviews" on public.reviews
    for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Users can delete their own reviews" on public.reviews
    for delete to authenticated
    using (user_id = (select auth.uid()));

-- Profiles: usernames are shown next to reviews, so reads are public.
-- Writes stay owner-only through the baseline policy.
create policy "Profiles are publicly readable" on public.user_profiles
    for select to anon, authenticated using (true);

-- Grants.
revoke all on public.movies, public.genres, public.movie_genres from anon, authenticated;
grant select on public.movies, public.genres, public.movie_genres to anon, authenticated;

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (user_id, movie_id, rating, comment) on public.reviews to authenticated;
grant update (rating, comment) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

revoke all on public.user_watchlist from anon, authenticated;
grant select, delete on public.user_watchlist to authenticated;
grant insert (user_id, movie_id) on public.user_watchlist to authenticated;

revoke all on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to anon, authenticated;
grant insert (user_id, username) on public.user_profiles to authenticated;
grant update (username) on public.user_profiles to authenticated;

revoke all on sequence public.movies_id_seq, public.genres_id_seq from anon, authenticated;
revoke all on sequence public.reviews_id_seq from anon, authenticated;
grant usage on sequence public.reviews_id_seq to authenticated;
