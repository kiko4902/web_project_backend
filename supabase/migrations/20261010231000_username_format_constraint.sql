-- Enforce the username character rule in the database as well as in the
-- API, so a direct write through the Supabase REST endpoint cannot bypass it.
-- Same pattern as the API schema and the handle_new_user trigger; the length
-- limits stay in user_profiles_username_length.
alter table public.user_profiles
    add constraint user_profiles_username_format
    check (username ~ '^[A-Za-z0-9_.-]+$');
