-- Counters for the API's auth rate limits. They live in the database because
-- the API runs as serverless functions, where in-memory counters are per
-- instance. Only the server's secret key (service_role) can reach any of this.

create table public.rate_limits (
    key text primary key,
    hits integer not null default 0,
    reset_at timestamp with time zone not null
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one hit and returns the running total for the current window,
-- starting a new window if the previous one has ended.
create function public.rate_limit_hit(p_key text, p_window_ms integer)
    returns table (hits integer, reset_at timestamp with time zone)
    language sql
    set search_path = ''
    as $$
  insert into public.rate_limits as r (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
  set hits = case when r.reset_at <= now() then 1 else r.hits + 1 end,
      reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
  returning r.hits, r.reset_at;
$$;

create function public.rate_limit_decrement(p_key text) returns void
    language sql
    set search_path = ''
    as $$
  update public.rate_limits set hits = greatest(hits - 1, 0) where key = p_key;
$$;

create function public.rate_limit_reset(p_key text) returns void
    language sql
    set search_path = ''
    as $$
  update public.rate_limits set hits = 0 where key = p_key;
$$;

revoke execute on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_decrement(text) from public, anon, authenticated;
revoke execute on function public.rate_limit_reset(text) from public, anon, authenticated;

grant select, insert, update on public.rate_limits to service_role;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
grant execute on function public.rate_limit_decrement(text) to service_role;
grant execute on function public.rate_limit_reset(text) to service_role;
