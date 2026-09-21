create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index posts_created_at_idx on public.posts (created_at desc, id desc);
create index posts_author_id_idx on public.posts (author_id);
create index comments_post_id_idx on public.comments (post_id, created_at asc);

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.blocks enable row level security;

create policy "blocks_read_own"
  on public.blocks for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

create policy "blocks_insert_own"
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

create policy "blocks_delete_own"
  on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

create or replace function public.is_blocked(first_profile uuid, second_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = first_profile and blocked_id = second_profile)
       or (blocker_id = second_profile and blocked_id = first_profile)
  )
$$;

create policy "posts_read_same_space_unblocked"
  on public.posts for select to authenticated
  using (
    public.same_space(auth.uid(), author_id)
    and not public.is_blocked(auth.uid(), author_id)
    and exists (select 1 from public.profiles where id = author_id and status = 'active')
  );

create policy "posts_insert_own_active"
  on public.posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
  );

create policy "posts_update_own"
  on public.posts for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "posts_delete_own"
  on public.posts for delete to authenticated
  using (author_id = auth.uid());

create policy "comments_read_same_space_unblocked"
  on public.comments for select to authenticated
  using (
    public.same_space(auth.uid(), author_id)
    and not public.is_blocked(auth.uid(), author_id)
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and public.same_space(auth.uid(), posts.author_id)
        and not public.is_blocked(auth.uid(), posts.author_id)
    )
  );

create policy "comments_insert_own_active"
  on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and public.same_space(auth.uid(), posts.author_id)
        and not public.is_blocked(auth.uid(), posts.author_id)
    )
  );

create policy "comments_update_own"
  on public.comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "comments_delete_own"
  on public.comments for delete to authenticated
  using (author_id = auth.uid());