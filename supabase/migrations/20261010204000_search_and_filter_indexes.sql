-- Partial-match title search (ILIKE '%term%') needs a trigram index;
-- the existing btree on title only helps exact and prefix matches.

create extension if not exists pg_trgm with schema extensions;

create index movies_title_trgm_idx on public.movies
    using gin (title extensions.gin_trgm_ops);

create index movies_imdb_rating_idx on public.movies (imdb_rating desc);

-- Genre filter looks up movies by genre; the primary key leads with movie_id.
create index movie_genres_genre_id_idx on public.movie_genres (genre_id, movie_id);

create index reviews_movie_id_created_at_idx on public.reviews (movie_id, created_at desc);

create index user_watchlist_user_id_added_at_idx on public.user_watchlist (user_id, added_at desc);
