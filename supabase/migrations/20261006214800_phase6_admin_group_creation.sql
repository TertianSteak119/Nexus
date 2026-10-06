-- Phase 6 adjustment: only moderator/admin accounts may create groups.

drop policy if exists groups_create_active on public.groups;

create policy groups_create_admin_only
on public.groups
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_moderator()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  )
);

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_admin_only
on public.groups
for update
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_admin_only
on public.groups
for delete
to authenticated
using (public.is_moderator());

create or replace function public.can_create_groups()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_moderator()
$$;

revoke all on function public.can_create_groups() from public, anon;
grant execute on function public.can_create_groups() to authenticated;
