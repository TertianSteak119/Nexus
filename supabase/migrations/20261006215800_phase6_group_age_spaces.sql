-- Phase 6 age spaces: regular users only access groups for their own age space.
-- Moderators/admins may access both spaces for management.

update public.groups g
set age_space = case
  when public.profile_age(g.created_by) between 12 and 17 then 'teen'
  else 'adult'
end
where age_space = 'all';

alter table public.groups
  drop constraint if exists groups_age_space_check;

alter table public.groups
  add constraint groups_age_space_check check (age_space in ('teen','adult'));

alter table public.groups
  alter column age_space drop default;

create or replace function public.can_access_group(target_group uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    join public.profiles p on p.id = viewer
    where g.id = target_group
      and p.status = 'active'
      and public.profile_age(p.id) >= 12
      and (
        public.is_moderator()
        or (g.age_space = 'teen' and public.profile_age(p.id) between 12 and 17)
        or (g.age_space = 'adult' and public.profile_age(p.id) >= 18)
      )
  )
$$;
