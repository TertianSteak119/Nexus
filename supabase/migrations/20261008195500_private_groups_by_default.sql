alter table public.profiles
  alter column show_groups_public set default false;

update public.profiles
set show_groups_public = false
where show_groups_public = true;
