-- Age-aware access model:
-- - Public posts/comments: visible across all authenticated ages 12+.
-- - Profile/discovery: only compatible age ranges.
-- - Direct chat compatibility: 12-15 <-> 12-17, 16-17 <-> 12+, 18+ <-> 16+.
-- Blocks and active account status always apply.

create or replace function public.profile_age(profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select extract(year from age(current_date, birth_date))::integer
  from public.profiles
  where id = profile_id
$$;

create or replace function public.can_view_content(viewer_id uuid, author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    viewer_id is not null
    and author_id is not null
    and exists (
      select 1 from public.profiles
      where id = viewer_id
        and status = 'active'
        and public.profile_age(id) >= 12
    )
    and exists (
      select 1 from public.profiles
      where id = author_id
        and status = 'active'
        and public.profile_age(id) >= 12
    )
    and not public.is_blocked(viewer_id, author_id)
$$;

create or replace function public.can_direct_chat(first_profile uuid, second_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    first_profile is not null
    and second_profile is not null
    and first_profile <> second_profile
    and first_age >= 12
    and second_age >= 12
    and not (
      (first_age between 12 and 15 and second_age >= 18)
      or
      (second_age between 12 and 15 and first_age >= 18)
    )
    and not public.is_blocked(first_profile, second_profile)
    and exists (
      select 1 from public.profiles
      where id = first_profile and status = 'active'
    )
    and exists (
      select 1 from public.profiles
      where id = second_profile and status = 'active'
    )
  from (
    select
      public.profile_age(first_profile) as first_age,
      public.profile_age(second_profile) as second_age
  ) ages
$$;

create or replace function public.can_view_profile(viewer_id uuid, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    viewer_id is not null
    and target_id is not null
    and (
      viewer_id = target_id
      or public.can_direct_chat(viewer_id, target_id)
    )
$$;

drop policy if exists "profiles_select_same_space" on public.profiles;
create policy "profiles_select_compatible_age"
  on public.profiles for select to authenticated
  using (public.can_view_profile(auth.uid(), id) and status <> 'banned');

drop policy if exists "profile_interests_same_space" on public.profile_interests;
create policy "profile_interests_compatible_age"
  on public.profile_interests for select to authenticated
  using (public.can_view_profile(auth.uid(), profile_id));

drop policy if exists "profile_looking_for_same_space" on public.profile_looking_for;
create policy "profile_looking_for_compatible_age"
  on public.profile_looking_for for select to authenticated
  using (public.can_view_profile(auth.uid(), profile_id));

drop policy if exists "posts_read_same_space_unblocked" on public.posts;
create policy "posts_read_all_ages_unblocked"
  on public.posts for select to authenticated
  using (public.can_view_content(auth.uid(), author_id));

drop policy if exists "comments_read_same_space_unblocked" on public.comments;
create policy "comments_read_all_ages_unblocked"
  on public.comments for select to authenticated
  using (
    public.can_view_content(auth.uid(), author_id)
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and public.can_view_content(auth.uid(), posts.author_id)
    )
  );

drop policy if exists "comments_insert_own_active" on public.comments;
create policy "comments_insert_on_visible_post"
  on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'active'
    )
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and public.can_view_content(auth.uid(), posts.author_id)
    )
  );

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
  order by greatest(
    similarity(p.username, coalesce(search_text, '')),
    similarity(p.full_name, coalesce(search_text, ''))
  ) desc, p.created_at desc
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
  select *
  from public.search_profiles(
    search_text, min_age, max_age, min_gpa, verified_only,
    interest_ids, looking_for_kinds, result_limit, 0
  )
  order by random()
$$;

revoke execute on function public.profile_age(uuid) from public, anon;
revoke execute on function public.can_view_content(uuid, uuid) from public, anon;
revoke execute on function public.can_direct_chat(uuid, uuid) from public, anon;
revoke execute on function public.can_view_profile(uuid, uuid) from public, anon;

grant execute on function public.profile_age(uuid) to authenticated;
grant execute on function public.can_view_content(uuid, uuid) to authenticated;
grant execute on function public.can_direct_chat(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
