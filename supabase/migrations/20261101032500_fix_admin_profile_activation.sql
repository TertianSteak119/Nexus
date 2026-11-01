-- Allow trusted backend/admin approval flows to update protected profile privileges,
-- while continuing to prevent ordinary authenticated users from self-promoting.

create or replace function public.prevent_profile_privilege_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or public.is_moderator() then
    new.updated_at := now();
    return new;
  end if;

  new.role := old.role;
  new.status := old.status;
  new.gpa_verified := old.gpa_verified;
  new.updated_at := now();
  return new;
end;
$$;
