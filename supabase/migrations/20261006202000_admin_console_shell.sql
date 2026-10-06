-- Dormant server-gated administration console.
-- IMPORTANT: No secret access code is implemented in this migration.
-- Access sessions can only be created by a trusted backend/service-role flow added later.

create table if not exists public.admin_access_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.admin_access_sessions enable row level security;
revoke all on table public.admin_access_sessions from public, anon, authenticated;

create or replace function public.has_admin_console_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_access_sessions s
    where s.user_id = auth.uid()
      and s.expires_at > now()
  );
$$;

revoke all on function public.has_admin_console_access() from public, anon;
grant execute on function public.has_admin_console_access() to authenticated;

create table if not exists public.account_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 120),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint account_reports_not_self check (reporter_id <> reported_profile_id)
);

create index if not exists account_reports_reported_idx on public.account_reports(reported_profile_id, created_at desc);
create index if not exists account_reports_status_idx on public.account_reports(status, created_at desc);
alter table public.account_reports enable row level security;

drop policy if exists account_reports_insert_own on public.account_reports;
create policy account_reports_insert_own
on public.account_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists account_reports_read_own on public.account_reports;
create policy account_reports_read_own
on public.account_reports
for select
to authenticated
using (reporter_id = auth.uid());

create table if not exists public.account_bans (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 500),
  active boolean not null default true,
  banned_at timestamptz not null default now(),
  banned_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_bans enable row level security;
revoke all on table public.account_bans from public, anon, authenticated;

create table if not exists public.admin_suggestions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references public.profiles(id) on delete set null,
  area text not null default 'moderation' check (area in ('moderation','safety','access','other')),
  suggestion text not null check (char_length(suggestion) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending','reviewed','accepted','rejected')),
  created_at timestamptz not null default now()
);

alter table public.admin_suggestions enable row level security;

drop policy if exists admin_suggestions_insert_own on public.admin_suggestions;
create policy admin_suggestions_insert_own
on public.admin_suggestions
for insert
to authenticated
with check (submitted_by = auth.uid());

create table if not exists public.group_suggestions (
  id uuid primary key default gen_random_uuid(),
  suggested_by uuid references public.profiles(id) on delete set null,
  group_name text not null check (char_length(group_name) between 2 and 100),
  description text check (description is null or char_length(description) <= 1500),
  status text not null default 'pending' check (status in ('pending','reviewed','accepted','rejected')),
  created_at timestamptz not null default now()
);

alter table public.group_suggestions enable row level security;

drop policy if exists group_suggestions_insert_own on public.group_suggestions;
create policy group_suggestions_insert_own
on public.group_suggestions
for insert
to authenticated
with check (suggested_by = auth.uid());

create or replace function public.require_admin_console_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_console_access() then
    raise exception 'ADMIN_CONSOLE_LOCKED' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.require_admin_console_access() from public, anon;
grant execute on function public.require_admin_console_access() to authenticated;

create or replace function public.admin_console_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return jsonb_build_object(
    'reported_accounts', (select count(distinct reported_profile_id) from public.account_reports where status = 'pending'),
    'pending_reports', (select count(*) from public.account_reports where status = 'pending'),
    'active_bans', (select count(*) from public.account_bans where active = true and (banned_until is null or banned_until > now())),
    'admin_suggestions', (select count(*) from public.admin_suggestions where status = 'pending'),
    'group_suggestions', (select count(*) from public.group_suggestions where status = 'pending')
  );
end;
$$;

create or replace function public.admin_list_reported_accounts()
returns table (
  profile_id uuid,
  username text,
  full_name text,
  report_count bigint,
  latest_report_at timestamptz,
  reasons text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return query
  select p.id, p.username, p.full_name,
         count(r.id)::bigint,
         max(r.created_at),
         array_agg(distinct r.reason order by r.reason)
  from public.account_reports r
  join public.profiles p on p.id = r.reported_profile_id
  where r.status = 'pending'
  group by p.id, p.username, p.full_name
  order by max(r.created_at) desc;
end;
$$;

create or replace function public.admin_list_banned_accounts()
returns table (
  profile_id uuid,
  username text,
  full_name text,
  reason text,
  banned_at timestamptz,
  banned_until timestamptz,
  active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return query
  select p.id, p.username, p.full_name, b.reason, b.banned_at, b.banned_until, b.active
  from public.account_bans b
  join public.profiles p on p.id = b.profile_id
  order by b.banned_at desc;
end;
$$;

create or replace function public.admin_list_suggestions()
returns table (
  id uuid,
  submitted_by uuid,
  username text,
  area text,
  suggestion text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return query
  select s.id, s.submitted_by, p.username, s.area, s.suggestion, s.status, s.created_at
  from public.admin_suggestions s
  left join public.profiles p on p.id = s.submitted_by
  order by s.created_at desc;
end;
$$;

create or replace function public.admin_list_group_suggestions()
returns table (
  id uuid,
  suggested_by uuid,
  username text,
  group_name text,
  description text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  return query
  select s.id, s.suggested_by, p.username, s.group_name, s.description, s.status, s.created_at
  from public.group_suggestions s
  left join public.profiles p on p.id = s.suggested_by
  order by s.created_at desc;
end;
$$;

revoke all on function public.admin_console_summary() from public, anon;
revoke all on function public.admin_list_reported_accounts() from public, anon;
revoke all on function public.admin_list_banned_accounts() from public, anon;
revoke all on function public.admin_list_suggestions() from public, anon;
revoke all on function public.admin_list_group_suggestions() from public, anon;

grant execute on function public.admin_console_summary() to authenticated;
grant execute on function public.admin_list_reported_accounts() to authenticated;
grant execute on function public.admin_list_banned_accounts() to authenticated;
grant execute on function public.admin_list_suggestions() to authenticated;
grant execute on function public.admin_list_group_suggestions() to authenticated;
