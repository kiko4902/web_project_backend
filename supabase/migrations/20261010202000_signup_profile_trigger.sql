-- Every new auth user gets a profile row. The previous version of this
-- function used the email address as the username, which then appeared
-- publicly next to reviews. Now the username comes from the sign-up metadata
-- when it is valid and free, and is otherwise generated.

create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
declare
  requested text := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  generated text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
begin
  if requested ~ '^[A-Za-z0-9_.-]{3,30}$' then
    begin
      insert into public.user_profiles (user_id, username)
      values (new.id, requested)
      on conflict (user_id) do nothing;
      return new;
    exception when unique_violation then
      null; -- name taken in the meantime: fall through to the generated one
    end;
  end if;

  insert into public.user_profiles (user_id, username)
  values (new.id, generated)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Backfill any user that predates the trigger.
insert into public.user_profiles (user_id, username)
select u.id, 'user_' || substr(replace(u.id::text, '-', ''), 1, 10)
from auth.users u
left join public.user_profiles p on p.user_id = u.id
where p.user_id is null
on conflict do nothing;

alter table public.user_profiles
    add constraint user_profiles_username_length
    check (char_length(username) between 3 and 30);
