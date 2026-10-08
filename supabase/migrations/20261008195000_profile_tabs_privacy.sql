-- Profile tabs, public wall posts and privacy-controlled group membership visibility.

alter table public.profiles
  add column if not exists show_groups_public boolean not null default true;

create or replace function public.list_profile_posts(
  target_profile uuid,
  result_limit integer default 50
)
returns table (
  id uuid,
  body text,
  author_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.body, p.author_id, p.created_at, p.updated_at
  from public.posts p
  where p.author_id = target_profile
    and exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.status = 'active'
        and public.profile_age(viewer.id) >= 12
    )
    and exists (
      select 1
      from public.profiles author
      where author.id = target_profile
        and author.status = 'active'
        and public.profile_age(author.id) >= 12
    )
    and public.can_view_content(auth.uid(), target_profile)
  order by p.created_at desc
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
$$;

create or replace function public.list_profile_groups(target_profile uuid)
returns table (
  group_id uuid,
  name text,
  description text,
  topic text,
  age_space text,
  member_role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.description,
    g.topic,
    g.age_space,
    gm.role,
    gm.joined_at
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles target on target.id = gm.profile_id
  where gm.profile_id = target_profile
    and target.status = 'active'
    and exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.status = 'active'
        and public.profile_age(viewer.id) >= 12
    )
    and not public.is_blocked(auth.uid(), target_profile)
    and (
      auth.uid() = target_profile
      or target.show_groups_public = true
    )
    and public.can_access_group(g.id, auth.uid())
  order by gm.joined_at desc, g.name asc
$$;

revoke all on function public.list_profile_posts(uuid, integer) from public, anon;
revoke all on function public.list_profile_groups(uuid) from public, anon;
grant execute on function public.list_profile_posts(uuid, integer) to authenticated;
grant execute on function public.list_profile_groups(uuid) to authenticated;
