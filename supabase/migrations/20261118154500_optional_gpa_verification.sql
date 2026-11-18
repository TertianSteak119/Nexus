-- Separate account approval from optional GPA verification.

create or replace function public.is_profile_application_complete(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = target_user
        and char_length(trim(p.username)) >= 3
        and char_length(trim(p.full_name)) >= 2
        and char_length(trim(p.school_name)) >= 2
    )
    and exists (
      select 1 from public.profile_interests pi where pi.profile_id = target_user
    )
    and exists (
      select 1 from public.profile_looking_for plf where plf.profile_id = target_user
    );
$$;

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
    update public.profiles
    set status = 'active',
        updated_at = now()
    where id = target_user;
  end if;
end;
$$;

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
  new.gpa := old.gpa;
  new.gpa_verified := old.gpa_verified;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.moderator_list_grade_verifications()
returns table (
  verification_id uuid,
  profile_id uuid,
  username text,
  full_name text,
  gpa numeric,
  image_path text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  return query
  select
    gv.id,
    gv.profile_id,
    p.username,
    p.full_name,
    gv.gpa,
    gv.image_path,
    gv.status::text,
    gv.created_at
  from public.grade_verifications gv
  join public.profiles p on p.id = gv.profile_id
  where gv.status = 'pending'
  order by gv.created_at asc;
end;
$$;

revoke all on function public.moderator_list_grade_verifications() from public, anon;
grant execute on function public.moderator_list_grade_verifications() to authenticated;

create or replace function public.moderator_review_grade_verification(
  verification_id uuid,
  approve boolean,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile uuid;
  target_gpa numeric;
begin
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  select gv.profile_id, gv.gpa
  into target_profile, target_gpa
  from public.grade_verifications gv
  where gv.id = verification_id
    and gv.status = 'pending'
  for update;

  if target_profile is null then
    raise exception 'VERIFICATION_NOT_PENDING';
  end if;

  update public.grade_verifications
  set
    status = case when approve then 'approved' else 'rejected' end::public.grade_verification_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(trim(note), '')
  where id = verification_id;

  if approve then
    update public.profiles
    set
      gpa = target_gpa,
      gpa_verified = true,
      updated_at = now()
    where id = target_profile;
  end if;
end;
$$;

revoke all on function public.moderator_review_grade_verification(uuid, boolean, text) from public, anon;
grant execute on function public.moderator_review_grade_verification(uuid, boolean, text) to authenticated;

create or replace function public.current_admin_state()
returns table (is_admin boolean, pending_requests integer)
language sql
stable
security definer
set search_path = public
as $$
  with admin_state as (
    select exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'moderator'
        and p.status = 'active'
    ) as allowed
  )
  select
    allowed,
    case when allowed then
      (
        select count(*)::integer
        from (
          select a.user_id::text
          from public.account_approvals a
          where a.status = 'pending'
          union all
          select gv.id::text
          from public.grade_verifications gv
          where gv.status = 'pending'
        ) pending_items
      )
      else 0
    end
  from admin_state;
$$;

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
  select
    p.id, p.username, p.full_name, p.avatar_path, p.bio,
    p.school_level, p.gpa, p.gpa_verified
  from public.profiles p
  where p.status = 'active'
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
    and (
      min_gpa is null
      or (p.gpa_verified = true and p.gpa is not null and p.gpa >= min_gpa)
    )
    and (not verified_only or p.gpa_verified = true)
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
  offset greatest(coalesce(result_offset, 0), 0);
$$;
