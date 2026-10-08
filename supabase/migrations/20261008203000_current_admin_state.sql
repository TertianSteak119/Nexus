create or replace function public.current_admin_state()
returns table (
  is_admin boolean,
  pending_requests integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'moderator'
        and p.status = 'active'
    ) as is_admin,
    case
      when exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'moderator'
          and p.status = 'active'
      )
      then (
        select count(*)::integer
        from public.account_approvals
        where status = 'pending'
      )
      else 0
    end as pending_requests;
$$;

revoke all on function public.current_admin_state() from public, anon;
grant execute on function public.current_admin_state() to authenticated;
