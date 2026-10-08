-- Centralize account approval and require verified profiles in discovery.

create or replace function public.complete_account_approval(
  target_user uuid,
  approve boolean,
  reviewer uuid default null,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_verification uuid;
begin
  if approve and not public.is_profile_application_complete(target_user) then
    raise exception 'ACCOUNT_APPLICATION_INCOMPLETE';
  end if;

  update public.account_approvals
  set
    status = case when approve then 'approved' else 'rejected' end,
    reviewed_at = now(),
    reviewed_by = reviewer,
    review_note = nullif(trim(note), '')
  where user_id = target_user
    and status = 'pending';

  if not found then
    raise exception 'ACCOUNT_REQUEST_NOT_PENDING';
  end if;

  if approve then
    select g.id
    into latest_verification
    from public.grade_verifications g
    where g.profile_id = target_user
    order by g.created_at desc
    limit 1;

    if latest_verification is null then
      raise exception 'GRADE_VERIFICATION_REQUIRED';
    end if;

    update public.grade_verifications
    set status = 'approved',
        reviewed_by = reviewer,
        reviewed_at = now(),
        review_note = coalesce(nullif(trim(note), ''), 'Verificado durante la aprobación de ingreso.')
    where id = latest_verification;

    update public.profiles
    set status = 'active',
        gpa_verified = true,
        updated_at = now()
    where id = target_user;
  end if;
end;
$$;

revoke all on function public.complete_account_approval(uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.complete_account_approval(uuid, boolean, uuid, text) to service_role;

create or replace function public.admin_review_account_approval(
  target_user uuid,
  approve boolean,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  perform public.complete_account_approval(target_user, approve, auth.uid(), note);
end;
$$;

revoke all on function public.admin_review_account_approval(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_account_approval(uuid, boolean, text) to authenticated;

create or replace function public.search_profiles(
  search_text text default null,
  min_age integer default null,
  max_age integer default null,
  min_gpa numeric default null,
  verified_only boolean default false,
  interest_ids uuid[] default null,
  looking_for_kinds public.profile_looking_for_kind[] default null,
  result_limit integer default 30,
  result_offset integer default 0
)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_path text,
  bio text,
  school_level public.school_level,
  gpa numeric,
  gpa_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.full_name, p.avatar_path, p.bio,
    p.school_level, p.gpa, p.gpa_verified
  from public.profiles p
  where p.status = 'active'
    and p.gpa_verified = true
    and p.id <> auth.uid()
    and public.can_view_profile(auth.uid(), p.id)
    and not public.is_blocked(auth.uid(), p.id)
    and (
      nullif(trim(search_text), '') is null
      or p.username ilike '%' || trim(search_text) || '%'
      or p.full_name ilike '%' || trim(search_text) || '%'
    )
    and (min_age is null or extract(year from age(current_date, p.birth_date)) >= min_age)
    and (max_age is null or extract(year from age(current_date, p.birth_date)) <= max_age)
    and (min_gpa is null or p.gpa >= min_gpa)
    and (
      interest_ids is null
      or exists (
        select 1 from public.profile_interests pi
        where pi.profile_id = p.id and pi.interest_id = any(interest_ids)
      )
    )
    and (
      looking_for_kinds is null
      or exists (
        select 1 from public.profile_looking_for plf
        where plf.profile_id = p.id and plf.kind = any(looking_for_kinds)
      )
    )
  order by greatest(
    similarity(p.username, coalesce(search_text, '')),
    similarity(p.full_name, coalesce(search_text, ''))
  ) desc, p.created_at desc
  limit least(greatest(coalesce(result_limit, 30), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0)
$$;
