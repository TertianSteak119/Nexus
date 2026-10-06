-- Phase 5: direct chat requests, conversations, realtime messages and block-aware access.

do $$ begin
  create type public.chat_request_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.conversation_type as enum ('direct', 'group');
exception when duplicate_object then null;
end $$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.conversation_type not null default 'direct',
  direct_pair_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.chat_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  status public.chat_request_status not null default 'pending',
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);

create unique index if not exists chat_requests_one_pending_pair_idx
  on public.chat_requests (
    least(from_id::text, to_id::text),
    greatest(from_id::text, to_id::text)
  )
  where status = 'pending';

create index if not exists chat_requests_to_status_idx
  on public.chat_requests (to_id, status, created_at desc);
create index if not exists chat_requests_from_status_idx
  on public.chat_requests (from_id, status, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

create or replace function public.direct_pair_key(first_profile uuid, second_profile uuid)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select case
    when first_profile::text < second_profile::text
      then first_profile::text || ':' || second_profile::text
    else second_profile::text || ':' || first_profile::text
  end
$$;

create or replace function public.is_conversation_member(target_conversation uuid, target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members
    where conversation_id = target_conversation
      and profile_id = target_profile
  )
$$;

create or replace function public.direct_conversation_other_user(target_conversation uuid, target_profile uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.profile_id
  from public.conversation_members cm
  where cm.conversation_id = target_conversation
    and cm.profile_id <> target_profile
  limit 1
$$;

create or replace function public.can_access_direct_conversation(target_conversation uuid, target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    c.type = 'direct'
    and public.is_conversation_member(c.id, target_profile)
    and other_id is not null
    and public.can_direct_chat(target_profile, other_id)
  from public.conversations c
  cross join lateral (
    select public.direct_conversation_other_user(c.id, target_profile) as other_id
  ) other_user
  where c.id = target_conversation
$$;

create or replace function public.prepare_chat_request_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_conversation uuid;
  pair_key text;
begin
  if new.from_id <> old.from_id or new.to_id <> old.to_id then
    raise exception 'No se pueden cambiar los participantes de una solicitud.';
  end if;

  if old.status <> 'pending' then
    raise exception 'Esta solicitud ya fue respondida.';
  end if;

  if new.status not in ('accepted', 'rejected') then
    raise exception 'Transición de solicitud no válida.';
  end if;

  if new.to_id <> auth.uid() then
    raise exception 'Solo el destinatario puede responder la solicitud.';
  end if;

  new.responded_at := now();

  if new.status = 'accepted' then
    if not public.can_direct_chat(new.from_id, new.to_id) then
      raise exception 'El chat directo no está permitido entre estos perfiles.';
    end if;

    pair_key := public.direct_pair_key(new.from_id, new.to_id);

    insert into public.conversations (type, direct_pair_key)
    values ('direct', pair_key)
    on conflict (direct_pair_key)
    do update set direct_pair_key = excluded.direct_pair_key
    returning id into target_conversation;

    insert into public.conversation_members (conversation_id, profile_id)
    values
      (target_conversation, new.from_id),
      (target_conversation, new.to_id)
    on conflict do nothing;

    new.conversation_id := target_conversation;
  else
    new.conversation_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_chat_request_response_trigger on public.chat_requests;
create trigger prepare_chat_request_response_trigger
  before update on public.chat_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.prepare_chat_request_response();

alter table public.chat_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "chat_requests_read_participants" on public.chat_requests;
create policy "chat_requests_read_participants"
  on public.chat_requests for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "chat_requests_send_compatible" on public.chat_requests;
create policy "chat_requests_send_compatible"
  on public.chat_requests for insert to authenticated
  with check (
    from_id = auth.uid()
    and status = 'pending'
    and conversation_id is null
    and public.can_direct_chat(from_id, to_id)
    and exists (
      select 1 from public.profiles
      where id = to_id
        and status = 'active'
        and accepts_message_requests = true
    )
  );

drop policy if exists "chat_requests_recipient_respond" on public.chat_requests;
create policy "chat_requests_recipient_respond"
  on public.chat_requests for update to authenticated
  using (to_id = auth.uid() and status = 'pending')
  with check (to_id = auth.uid() and status in ('accepted', 'rejected'));

drop policy if exists "conversations_read_members" on public.conversations;
create policy "conversations_read_members"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));

drop policy if exists "conversation_members_read_members" on public.conversation_members;
create policy "conversation_members_read_members"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages_read_active_chat" on public.messages;
create policy "messages_read_active_chat"
  on public.messages for select to authenticated
  using (public.can_access_direct_conversation(conversation_id, auth.uid()));

drop policy if exists "messages_send_active_chat" on public.messages;
create policy "messages_send_active_chat"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_direct_conversation(conversation_id, auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'active'
    )
  );

create or replace function public.list_direct_conversations()
returns table (
  conversation_id uuid,
  other_id uuid,
  username text,
  full_name text,
  avatar_path text,
  last_message text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    other.id,
    other.username,
    other.full_name,
    other.avatar_path,
    last_msg.body,
    last_msg.created_at
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.profile_id = auth.uid()
  join public.conversation_members theirs
    on theirs.conversation_id = c.id and theirs.profile_id <> auth.uid()
  join public.profiles other on other.id = theirs.profile_id
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_msg on true
  where c.type = 'direct'
    and public.can_access_direct_conversation(c.id, auth.uid())
  order by coalesce(last_msg.created_at, c.created_at) desc
$$;

create or replace function public.list_blocked_profiles()
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.full_name, p.avatar_path
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

revoke execute on function public.direct_pair_key(uuid, uuid) from public, anon;
revoke execute on function public.is_conversation_member(uuid, uuid) from public, anon;
revoke execute on function public.direct_conversation_other_user(uuid, uuid) from public, anon;
revoke execute on function public.can_access_direct_conversation(uuid, uuid) from public, anon;
revoke execute on function public.list_direct_conversations() from public, anon;
revoke execute on function public.list_blocked_profiles() from public, anon;

grant execute on function public.direct_pair_key(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.direct_conversation_other_user(uuid, uuid) to authenticated;
grant execute on function public.can_access_direct_conversation(uuid, uuid) to authenticated;
grant execute on function public.list_direct_conversations() to authenticated;
grant execute on function public.list_blocked_profiles() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
