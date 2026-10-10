-- The source dataset has a certificate ("PG") in the year column for this one
-- row, so it was imported as null. Apollo 13 was released in 1995.

update public.movies
set release_date = 1995
where id = 967 and title = 'Apollo 13' and release_date is null;
