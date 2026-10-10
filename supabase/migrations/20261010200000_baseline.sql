-- Baseline: the public schema as it existed before migrations were introduced.
-- On the original project this is recorded as applied without being run
-- (npm run db:migrate -- --baseline 20261010200000).
-- On a fresh Supabase project it is run like any other migration.

create table public.movies (
    id serial primary key,
    title text not null,
    overview text,
    poster_url text,
    certificate text,
    runtime text,
    imdb_rating numeric,
    meta_score numeric,
    no_of_votes bigint,
    gross text,
    release_date numeric,
    avg_rating numeric(3,1)
);

create table public.genres (
    id serial primary key,
    name text not null,
    constraint genres_name_key unique (name)
);

create table public.movie_genres (
    movie_id integer not null references public.movies(id) on delete cascade,
    genre_id integer not null references public.genres(id) on delete cascade,
    constraint movie_genres_pkey primary key (movie_id, genre_id)
);

create table public.user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null,
    created_at timestamp with time zone default now(),
    constraint user_profiles_username_key unique (username)
);

create table public.reviews (
    id serial primary key,
    user_id uuid references auth.users(id) on delete cascade,
    movie_id integer references public.movies(id) on delete cascade,
    rating integer,
    comment text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone,
    username text default 'anonymous'::text,
    constraint reviews_rating_check check (rating >= 1 and rating <= 5),
    constraint reviews_user_id_movie_id_key unique (user_id, movie_id),
    constraint fk_reviews_user_profiles foreign key (user_id) references public.user_profiles(user_id)
);

create table public.user_watchlist (
    user_id uuid not null references auth.users(id) on delete cascade,
    movie_id integer not null references public.movies(id) on delete cascade,
    added_at timestamp with time zone default now(),
    constraint user_watchlist_pkey primary key (user_id, movie_id)
);

create index idx_movie_genres on public.movie_genres using btree (movie_id, genre_id);
create index idx_movies_release_date on public.movies using btree (release_date);
create index idx_movies_title on public.movies using btree (title);

create function public.column_exists(table_name text, column_name text) returns boolean
    language plpgsql
    as $_$
begin
  return exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
    and table_name = $1
    and column_name = $2
  );
end;
$_$;

create function public.handle_new_user() returns trigger
    language plpgsql security definer
    as $$
begin
  insert into public.user_profiles (user_id, username)
  values (new.id, new.email);
  return new;
end;
$$;

create function public.update_movie_avg_rating() returns trigger
    language plpgsql
    as $$
begin
  update movies
  set avg_rating = (
    select avg(rating) from reviews where movie_id = new.movie_id
  )
  where id = new.movie_id;
  return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Row level security as it stood: only user_profiles had it enabled.
-- The policies on movies and user_watchlist existed but were inactive.
alter table public.user_profiles enable row level security;

create policy "Enable public read access" on public.movies
    for select using (true);

create policy "User profiles are user-specific" on public.user_profiles
    using (user_id = auth.uid());

create policy "Users can manage their watchlist" on public.user_watchlist
    using (user_id = auth.uid()) with check (user_id = auth.uid());
