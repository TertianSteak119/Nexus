-- Either owner approval OR email confirmation is sufficient to activate a completed account application.

create or replace function public.approve_completed_account_from_email(target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.account_approvals
    where user_id = target_user
      and status = 'pending'
  ) then
    return false;
  end if;

  if not public.is_profile_application_complete(target_user) then
    return false;
  end if;

  perform public.complete_account_approval(
    target_user,
    true,
    null,
    'Aprobada automáticamente al confirmar el correo electrónico.'
  );

  return true;
exception
  when others then
    if sqlerrm like '%ACCOUNT_REQUEST_NOT_PENDING%' then
      return false;
    end if;
    raise;
end;
$$;

revoke all on function public.approve_completed_account_from_email(uuid) from public, anon, authenticated;
grant execute on function public.approve_completed_account_from_email(uuid) to service_role;

create or replace function public.handle_email_confirmation_account_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.approve_completed_account_from_email(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.handle_email_confirmation_account_approval() from public, anon, authenticated;

drop trigger if exists nexus_email_confirmation_approves_account on auth.users;
create trigger nexus_email_confirmation_approves_account
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.handle_email_confirmation_account_approval();

create or replace function public.moderator_review_account_approval(
  target_user uuid,
  approve boolean,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  perform public.complete_account_approval(target_user, approve, auth.uid(), note);

  if approve then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = target_user;
  end if;
end;
$$;

revoke all on function public.moderator_review_account_approval(uuid, boolean, text) from public, anon;
grant execute on function public.moderator_review_account_approval(uuid, boolean, text) to authenticated;

create or replace function public.admin_review_account_approval(
  target_user uuid,
  approve boolean,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.require_admin_console_access();
  perform public.complete_account_approval(target_user, approve, auth.uid(), note);

  if approve then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = target_user;
  end if;
end;
$$;

revoke all on function public.admin_review_account_approval(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_account_approval(uuid, boolean, text) to authenticated;
