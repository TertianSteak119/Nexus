create extension if not exists pg_trgm;

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
    and p.id <> auth.uid()
    and public.same_space(auth.uid(), p.id)
    and not public.is_blocked(auth.uid(), p.id)
    and (
      nullif(trim(search_text), '') is null
      or p.username ilike '%' || trim(search_text) || '%'
      or p.full_name ilike '%' || trim(search_text) || '%'
    )
    and (min_age is null or extract(year from age(current_date, p.birth_date)) >= min_age)
    and (max_age is null or extract(year from age(current_date, p.birth_date)) <= max_age)
    and (min_gpa is null or p.gpa >= min_gpa)
    and (not verified_only or p.gpa_verified)
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
  order by greatest(similarity(p.username, coalesce(search_text, '')), similarity(p.full_name, coalesce(search_text, ''))) desc, p.created_at desc
  limit least(greatest(coalesce(result_limit, 30), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0)
$$;

create or replace function public.suggest_profiles(
  search_text text default null,
  min_age integer default null,
  max_age integer default null,
  min_gpa numeric default null,
  verified_only boolean default false,
  interest_ids uuid[] default null,
  looking_for_kinds public.profile_looking_for_kind[] default null,
  result_limit integer default 20
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
  select * from public.search_profiles(
    search_text, min_age, max_age, min_gpa, verified_only,
    interest_ids, looking_for_kinds, result_limit, 0
  ) order by random()
$$;

revoke execute on function public.search_profiles(text, integer, integer, numeric, boolean, uuid[], public.profile_looking_for_kind[], integer, integer) from public, anon;
grant execute on function public.search_profiles(text, integer, integer, numeric, boolean, uuid[], public.profile_looking_for_kind[], integer, integer) to authenticated;
revoke execute on function public.suggest_profiles(text, integer, integer, numeric, boolean, uuid[], public.profile_looking_for_kind[], integer) from public, anon;
grant execute on function public.suggest_profiles(text, integer, integer, numeric, boolean, uuid[], public.profile_looking_for_kind[], integer) to authenticated;