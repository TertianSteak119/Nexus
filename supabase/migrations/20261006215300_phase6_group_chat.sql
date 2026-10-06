-- Phase 6 group realtime chat integration.

alter table public.conversations
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

create unique index if not exists conversations_group_id_unique_idx
  on public.conversations(group_id)
  where group_id is not null;

create or replace function public.ensure_group_conversation(target_group uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_conversation uuid;
begin
  insert into public.conversations(type, group_id)
  values ('group', target_group)
  on conflict (group_id) where group_id is not null
  do update set group_id = excluded.group_id
  returning id into target_conversation;

  return target_conversation;
end;
$$;

create or replace function public.sync_group_member_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_conversation uuid;
begin
  if tg_op = 'INSERT' then
    target_conversation := public.ensure_group_conversation(new.group_id);
    insert into public.conversation_members(conversation_id, profile_id)
    values (target_conversation, new.profile_id)
    on conflict do nothing;
    return new;
  elsif tg_op = 'DELETE' then
    select id into target_conversation
    from public.conversations
    where type = 'group' and group_id = old.group_id;

    if target_conversation is not null then
      delete from public.conversation_members
      where conversation_id = target_conversation
        and profile_id = old.profile_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists group_members_sync_conversation on public.group_members;
create trigger group_members_sync_conversation
after insert or delete on public.group_members
for each row execute procedure public.sync_group_member_conversation();

-- Backfill conversations and membership for groups created before this migration.
insert into public.conversations(type, group_id)
select 'group', g.id
from public.groups g
where not exists (
  select 1 from public.conversations c
  where c.type = 'group' and c.group_id = g.id
)
on conflict do nothing;

insert into public.conversation_members(conversation_id, profile_id)
select c.id, gm.profile_id
from public.group_members gm
join public.conversations c
  on c.type = 'group' and c.group_id = gm.group_id
on conflict do nothing;

create or replace function public.can_access_group_conversation(target_conversation uuid, target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    c.type = 'group'
    and c.group_id is not null
    and public.is_group_member(c.group_id, target_profile)
    and public.can_access_group(c.group_id, target_profile)
  from public.conversations c
  where c.id = target_conversation
$$;

drop policy if exists messages_read_active_chat on public.messages;
create policy messages_read_active_chat
on public.messages
for select
to authenticated
using (
  public.can_access_direct_conversation(conversation_id, auth.uid())
  or public.can_access_group_conversation(conversation_id, auth.uid())
);

drop policy if exists messages_send_active_chat on public.messages;
create policy messages_send_active_chat
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and (
    public.can_access_direct_conversation(conversation_id, auth.uid())
    or public.can_access_group_conversation(conversation_id, auth.uid())
  )
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  )
);

revoke all on function public.ensure_group_conversation(uuid) from public, anon, authenticated;
revoke all on function public.can_access_group_conversation(uuid, uuid) from public, anon;
grant execute on function public.can_access_group_conversation(uuid, uuid) to authenticated;
