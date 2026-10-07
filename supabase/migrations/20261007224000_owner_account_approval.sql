-- Owner-only account approval flow.
-- Email confirmation verifies email ownership only; it never grants access to Nexus.

create table if not exists public.account_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 1000)
);

alter table public.account_approvals enable row level security;
revoke all on table public.account_approvals from public, anon, authenticated;

drop policy if exists account_approvals_read_own on public.account_approvals;
create policy account_approvals_read_own
on public.account_approvals
for select
to authenticated
using (user_id = auth.uid());

grant select on table public.account_approvals to authenticated;

-- Existing accounts predate the approval workflow, so preserve their current access.
insert into public.account_approvals (user_id, status, requested_at, reviewed_at, review_note)
select u.id, 'approved', u.created_at, now(), 'Cuenta existente antes del flujo de aprobación administrativa.'
from auth.users u
where not exists (
  select 1 from public.account_approvals a where a.user_id = u.id
);

create or replace function public.create_pending_account_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_approvals (user_id, status, requested_at)
  values (new.id, 'pending', coalesce(new.created_at, now()))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_pending_account_approval() from public, anon, authenticated;

drop trigger if exists auth_user_create_pending_approval on auth.users;
create trigger auth_user_create_pending_approval
after insert on auth.users
for each row execute procedure public.create_pending_account_approval();

create or replace function public.is_account_approved(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_approvals a
    where a.user_id = target_user
      and a.status = 'approved'
  );
$$;

revoke all on function public.is_account_approved(uuid) from public, anon;
grant execute on function public.is_account_approved(uuid) to authenticated;

-- An unapproved account cannot create or modify its profile even through direct API calls.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and public.is_account_approved(auth.uid())
  and public.age_space(birth_date) is not null
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid() and public.is_account_approved(auth.uid()))
with check (
  id = auth.uid()
  and public.is_account_approved(auth.uid())
  and public.age_space(birth_date) is not null
);

drop policy if exists "avatar_owner_upload" on storage.objects;
create policy "avatar_owner_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_account_approved(auth.uid())
);

drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_account_approved(auth.uid())
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_account_approved(auth.uid())
);

drop policy if exists "boleta_owner_upload" on storage.objects;
create policy "boleta_owner_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'boletas'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_account_approved(auth.uid())
);

create or replace function public.admin_list_account_approvals()
returns table (
  user_id uuid,
  email text,
  full_name text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.require_admin_console_access();

  return query
  select
    a.user_id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', 'Sin nombre')::text,
    a.status,
    a.requested_at,
    a.reviewed_at,
    a.review_note
  from public.account_approvals a
  join auth.users u on u.id = a.user_id
  order by
    case a.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    a.requested_at desc;
end;
$$;

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

  update public.account_approvals
  set
    status = case when approve then 'approved' else 'rejected' end,
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    review_note = nullif(trim(note), '')
  where user_id = target_user
    and status = 'pending';

  if not found then
    raise exception 'ACCOUNT_REQUEST_NOT_PENDING';
  end if;
end;
$$;

revoke all on function public.admin_list_account_approvals() from public, anon;
revoke all on function public.admin_review_account_approval(uuid, boolean, text) from public, anon;
grant execute on function public.admin_list_account_approvals() to authenticated;
grant execute on function public.admin_review_account_approval(uuid, boolean, text) to authenticated;

create or replace function public.admin_console_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'pending_account_approvals', (select count(*) from public.account_approvals where status = 'pending'),
    'reported_accounts', (select count(distinct reported_id) from public.reports where status in ('open','reviewing')),
    'pending_reports', (select count(*) from public.reports where status in ('open','reviewing')),
    'priority_reports', (select count(*) from public.reports where status in ('open','reviewing') and involves_minor),
    'active_bans', (select count(*) from public.account_bans where active = true and (banned_until is null or banned_until > now())),
    'pending_grade_verifications', (select count(*) from public.grade_verifications where status = 'pending'),
    'admin_suggestions', (select count(*) from public.admin_suggestions where status = 'pending'),
    'group_suggestions', (select count(*) from public.group_suggestions where status = 'pending')
  );
end;
$$;
