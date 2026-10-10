-- One profile predates the username character rule and contains a space.
-- Replace the space with an underscore so the name satisfies the rule the
-- API enforces (letters, digits, dots, dashes, underscores).
update public.user_profiles
   set username = 'Kristian_Dzoic'
 where username = 'Kristian Dzoic';
