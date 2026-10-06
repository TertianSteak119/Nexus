create or replace function public.admin_console_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'reported_accounts', (select count(distinct reported_profile_id) from public.account_reports where status = 'pending'),
    'pending_reports', (select count(*) from public.account_reports where status = 'pending'),
    'active_bans', (select count(*) from public.account_bans where active = true and (banned_until is null or banned_until > now())),
    'admin_suggestions', (select count(*) from public.admin_suggestions where status = 'pending'),
    'group_suggestions', (select count(*) from public.group_suggestions where status = 'pending')
  );
end;
$$;

revoke all on function public.admin_console_summary() from public, anon;
grant execute on function public.admin_console_summary() to authenticated;
