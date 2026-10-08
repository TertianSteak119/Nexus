create or replace function public.admin_issue_pending_application_link(target_user uuid)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  raw_token text;
  token_hash text;
begin
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  if not exists (
    select 1 from public.account_approvals
    where user_id = target_user and status = 'pending'
  ) then
    raise exception 'ACCOUNT_NOT_PENDING';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  token_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  update auth.users
  set raw_user_meta_data =
      coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'application_token_hash', token_hash,
        'application_token_expires_at', (now() + interval '7 days')::text
      )
  where id = target_user;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  return raw_token;
end;
$$;

revoke all on function public.admin_issue_pending_application_link(uuid) from public, anon;
grant execute on function public.admin_issue_pending_application_link(uuid) to authenticated;
