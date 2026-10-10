-- Reviews: enforce what the API already assumed, and keep updated_at and
-- movies.avg_rating correct in the database instead of in application code.

alter table public.reviews
    alter column user_id set not null,
    alter column movie_id set not null,
    alter column rating set not null;

alter table public.reviews
    add constraint reviews_comment_length
    check (comment is null or char_length(comment) <= 500);

comment on column public.reviews.username is
    'Deprecated: usernames are read from user_profiles. Kept only so no data is dropped.';

create function public.set_review_updated_at() returns trigger
    language plpgsql
    set search_path = ''
    as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reviews_set_updated_at
    before update on public.reviews
    for each row execute function public.set_review_updated_at();

-- Runs as the function owner because clients cannot write to movies.
create or replace function public.update_movie_avg_rating() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
declare
  affected integer[];
begin
  if tg_op = 'DELETE' then
    affected := array[old.movie_id];
  elsif tg_op = 'UPDATE' then
    affected := array[old.movie_id, new.movie_id];
  else
    affected := array[new.movie_id];
  end if;

  update public.movies m
  set avg_rating = (
    select round(avg(r.rating), 1) from public.reviews r where r.movie_id = m.id
  )
  where m.id = any (affected);

  return null;
end;
$$;

create trigger reviews_update_movie_avg_rating
    after insert or delete or update of rating, movie_id on public.reviews
    for each row execute function public.update_movie_avg_rating();

revoke execute on function public.update_movie_avg_rating() from public, anon, authenticated;
revoke execute on function public.set_review_updated_at() from public, anon, authenticated;

-- Backfill from the reviews that already exist.
update public.movies m
set avg_rating = s.avg
from (
  select movie_id, round(avg(rating), 1) as avg from public.reviews group by movie_id
) s
where s.movie_id = m.id;
