-- Phase 6: Groups

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text check (description is null or char_length(trim(description)) <= 1500),
  topic text not null check (char_length(trim(topic)) between 2 and 80),
  age_space text not null default 'all' check (age_space in ('all','teen','adult')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.group_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists groups_created_at_idx on public.groups(created_at desc);
create index if not exists groups_topic_idx on public.groups(topic);
create index if not exists group_members_profile_idx on public.group_members(profile_id, joined_at desc);
create index if not exists group_posts_group_idx on public.group_posts(group_id, created_at desc);
create index if not exists group_comments_post_idx on public.group_comments(post_id, created_at asc);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;
alter table public.group_comments enable row level security;

create or replace function public.can_access_group(target_group uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    join public.profiles p on p.id = viewer
    where g.id = target_group
      and p.status = 'active'
      and public.profile_age(p.id) >= 12
      and (
        g.age_space = 'all'
        or (g.age_space = 'teen' and public.profile_age(p.id) between 12 and 17)
        or (g.age_space = 'adult' and public.profile_age(p.id) >= 18)
      )
  )
$$;

create or replace function public.is_group_member(target_group uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group and gm.profile_id = viewer
  )
$$;

create or replace function public.is_group_owner(target_group uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group
      and gm.profile_id = viewer
      and gm.role = 'owner'
  )
$$;

create or replace function public.add_group_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members(group_id, profile_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, profile_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists groups_add_owner_membership on public.groups;
create trigger groups_add_owner_membership
after insert on public.groups
for each row execute procedure public.add_group_owner_membership();

drop policy if exists groups_read_compatible on public.groups;
create policy groups_read_compatible
on public.groups for select to authenticated
using (public.can_access_group(id, auth.uid()));

drop policy if exists groups_create_active on public.groups;
create policy groups_create_active
on public.groups for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
);

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner
on public.groups for update to authenticated
using (public.is_group_owner(id, auth.uid()))
with check (created_by = auth.uid());

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner
on public.groups for delete to authenticated
using (public.is_group_owner(id, auth.uid()));

drop policy if exists group_members_read_compatible on public.group_members;
create policy group_members_read_compatible
on public.group_members for select to authenticated
using (public.can_access_group(group_id, auth.uid()));

drop policy if exists group_members_join_self on public.group_members;
create policy group_members_join_self
on public.group_members for insert to authenticated
with check (
  profile_id = auth.uid()
  and role = 'member'
  and public.can_access_group(group_id, auth.uid())
);

drop policy if exists group_members_leave_self on public.group_members;
create policy group_members_leave_self
on public.group_members for delete to authenticated
using (profile_id = auth.uid() and role <> 'owner');

drop policy if exists group_posts_read on public.group_posts;
create policy group_posts_read
on public.group_posts for select to authenticated
using (
  public.can_access_group(group_id, auth.uid())
  and public.can_view_content(auth.uid(), author_id)
);

drop policy if exists group_posts_insert_member on public.group_posts;
create policy group_posts_insert_member
on public.group_posts for insert to authenticated
with check (
  author_id = auth.uid()
  and public.is_group_member(group_id, auth.uid())
  and public.can_access_group(group_id, auth.uid())
);

drop policy if exists group_posts_update_own on public.group_posts;
create policy group_posts_update_own
on public.group_posts for update to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists group_posts_delete_own_or_owner on public.group_posts;
create policy group_posts_delete_own_or_owner
on public.group_posts for delete to authenticated
using (author_id = auth.uid() or public.is_group_owner(group_id, auth.uid()));

drop policy if exists group_comments_read on public.group_comments;
create policy group_comments_read
on public.group_comments for select to authenticated
using (
  public.can_view_content(auth.uid(), author_id)
  and exists (
    select 1 from public.group_posts gp
    where gp.id = group_comments.post_id
      and public.can_access_group(gp.group_id, auth.uid())
      and public.can_view_content(auth.uid(), gp.author_id)
  )
);

drop policy if exists group_comments_insert_member on public.group_comments;
create policy group_comments_insert_member
on public.group_comments for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.group_posts gp
    where gp.id = group_comments.post_id
      and public.is_group_member(gp.group_id, auth.uid())
      and public.can_access_group(gp.group_id, auth.uid())
      and public.can_view_content(auth.uid(), gp.author_id)
  )
);

drop policy if exists group_comments_update_own on public.group_comments;
create policy group_comments_update_own
on public.group_comments for update to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists group_comments_delete_own_or_owner on public.group_comments;
create policy group_comments_delete_own_or_owner
on public.group_comments for delete to authenticated
using (
  author_id = auth.uid()
  or exists (
    select 1 from public.group_posts gp
    where gp.id = group_comments.post_id
      and public.is_group_owner(gp.group_id, auth.uid())
  )
);

revoke all on function public.can_access_group(uuid, uuid) from public, anon;
revoke all on function public.is_group_member(uuid, uuid) from public, anon;
revoke all on function public.is_group_owner(uuid, uuid) from public, anon;
grant execute on function public.can_access_group(uuid, uuid) to authenticated;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_posts'
  ) then
    alter publication supabase_realtime add table public.group_posts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_comments'
  ) then
    alter publication supabase_realtime add table public.group_comments;
  end if;
end
$$;
