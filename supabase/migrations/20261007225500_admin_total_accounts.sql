create or replace function public.admin_console_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return jsonb_build_object(
    'total_users', (select count(*) from public.account_approvals),
    'pending_account_approvals', (select count(*) from public.account_approvals where status = 'pending'),
    'reported_accounts', (select count(distinct reported_id) from public.reports where status in ('open','reviewing')),
    'pending_reports', (select count(*) from public.reports where status in ('open','reviewing')),
    'priority_reports', (select count(*) from public.reports where status in ('open','reviewing') and involves_minor),
    'active_bans', (select count(*) from public.account_bans where active = true and (banned_until is null or banned_until > now())),
    'pending_grade_verifications', (select count(*) from public.grade_verifications where status = 'pending'),
    'admin_suggestions', (select count(*) from public.admin_suggestions where status = 'pending'),
    'group_suggestions', (select count(*) from public.group_suggestions where status = 'pending')
  );
end;
$$;
