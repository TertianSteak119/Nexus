-- Phase 7 moderation core: reports, private evidence, moderation actions,
-- grade review helpers, and account-state enforcement.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open','reviewing','resolved','dismissed');
  end if;
  if not exists (select 1 from pg_type where typname = 'moderation_action_kind') then
    create type public.moderation_action_kind as enum ('warn','suspend','ban','unban');
  end if;
  if not exists (select 1 from pg_type where typname = 'report_target_kind') then
    create type public.report_target_kind as enum ('profile','post','comment','message');
  end if;
end $$;

create table if not exists public.report_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 80),
  created_at timestamptz not null default now()
);

insert into public.report_categories(name) values
  ('Acoso'),
  ('Perfil falso'),
  ('Contenido inapropiado'),
  ('Spam'),
  ('Suplantación'),
  ('Amenazas'),
  ('Otro')
on conflict (name) do nothing;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.report_categories(id),
  target_kind public.report_target_kind not null default 'profile',
  target_id uuid,
  message text check (message is null or char_length(trim(message)) <= 2000),
  evidence_path text,
  status public.report_status not null default 'open',
  involves_minor boolean not null default false,
  resolved_by uuid references public.profiles(id),
  resolution_note text check (resolution_note is null or char_length(trim(resolution_note)) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (reporter_id <> reported_id)
);

create index if not exists reports_status_priority_idx
  on public.reports(status, involves_minor desc, created_at desc);
create index if not exists reports_reported_idx
  on public.reports(reported_id, created_at desc);
create index if not exists reports_reporter_idx
  on public.reports(reporter_id, created_at desc);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.profiles(id),
  target_id uuid not null references public.profiles(id) on delete cascade,
  action public.moderation_action_kind not null,
  report_id uuid references public.reports(id) on delete set null,
  note text check (note is null or char_length(trim(note)) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_target_idx
  on public.moderation_actions(target_id, created_at desc);

alter table public.report_categories enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists report_categories_read_authenticated on public.report_categories;
create policy report_categories_read_authenticated
on public.report_categories for select to authenticated using (true);

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
on public.reports for insert to authenticated
with check (
  reporter_id = auth.uid()
  and reporter_id <> reported_id
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
);

drop policy if exists reports_read_own on public.reports;
create policy reports_read_own
on public.reports for select to authenticated
using (reporter_id = auth.uid());

revoke all on table public.moderation_actions from public, anon, authenticated;

create or replace function public.prepare_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reporter_age integer;
  reported_age integer;
begin
  reporter_age := public.profile_age(new.reporter_id);
  reported_age := public.profile_age(new.reported_id);

  new.involves_minor :=
    coalesce(reporter_age between 12 and 17, false)
    or coalesce(reported_age between 12 and 17, false);
  new.status := 'open';
  new.resolved_by := null;
  new.resolution_note := null;
  new.resolved_at := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reports_prepare on public.reports;
create trigger reports_prepare
before insert on public.reports
for each row execute procedure public.prepare_report();

create or replace function public.touch_report()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reports_touch on public.reports;
create trigger reports_touch
before update on public.reports
for each row execute procedure public.touch_report();

insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists report_evidence_owner_upload on storage.objects;
create policy report_evidence_owner_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists report_evidence_owner_read on storage.objects;
create policy report_evidence_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'report-evidence'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_moderator()
  )
);

create or replace function public.admin_list_reports(
  filter_status text default null,
  minors_only boolean default false
)
returns table (
  id uuid,
  reporter_id uuid,
  reporter_username text,
  reported_id uuid,
  reported_username text,
  category_name text,
  target_kind text,
  target_id uuid,
  message text,
  evidence_path text,
  status text,
  involves_minor boolean,
  resolution_note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.reporter_id,
    rp.username,
    r.reported_id,
    tp.username,
    rc.name,
    r.target_kind::text,
    r.target_id,
    r.message,
    r.evidence_path,
    r.status::text,
    r.involves_minor,
    r.resolution_note,
    r.created_at
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles tp on tp.id = r.reported_id
  join public.report_categories rc on rc.id = r.category_id
  where (filter_status is null or r.status::text = filter_status)
    and (not minors_only or r.involves_minor)
  order by r.involves_minor desc, r.created_at desc;
end;
$$;

create or replace function public.admin_update_report(
  target_report uuid,
  next_status text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED' using errcode = '42501';
  end if;
  if next_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'INVALID_REPORT_STATUS';
  end if;

  update public.reports
  set status = next_status::public.report_status,
      resolution_note = nullif(trim(note), ''),
      resolved_by = case when next_status in ('resolved','dismissed') then auth.uid() else null end,
      resolved_at = case when next_status in ('resolved','dismissed') then now() else null end
  where id = target_report;
end;
$$;

create or replace function public.admin_moderate_user(
  target_profile uuid,
  action_name text,
  note text default null,
  related_report uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED' using errcode = '42501';
  end if;
  if target_profile = auth.uid() then
    raise exception 'CANNOT_MODERATE_SELF';
  end if;
  if action_name not in ('warn','suspend','ban','unban') then
    raise exception 'INVALID_MODERATION_ACTION';
  end if;

  if action_name = 'suspend' then
    update public.profiles set status = 'suspended' where id = target_profile;
  elsif action_name = 'ban' then
    update public.profiles set status = 'banned' where id = target_profile;
  elsif action_name = 'unban' then
    update public.profiles set status = 'active' where id = target_profile;
  end if;

  insert into public.moderation_actions(moderator_id, target_id, action, report_id, note)
  values (auth.uid(), target_profile, action_name::public.moderation_action_kind, related_report, nullif(trim(note), ''));

  if action_name = 'ban' then
    insert into public.account_bans(profile_id, reason, active, banned_at, updated_at)
    values (target_profile, coalesce(nullif(trim(note), ''), 'Baneado por moderación'), true, now(), now())
    on conflict (profile_id) do update
      set reason = excluded.reason, active = true, banned_at = now(), updated_at = now(), banned_until = null;
  elsif action_name = 'unban' then
    update public.account_bans set active = false, updated_at = now() where profile_id = target_profile;
  end if;
end;
$$;

create or replace function public.admin_list_grade_verifications()
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
security definer
set search_path = public
as $$
begin
  perform public.require_admin_console_access();
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED' using errcode = '42501';
  end if;

  return query
  select gv.id, gv.profile_id, p.username, p.full_name, gv.gpa, gv.image_path, gv.status::text, gv.created_at
  from public.grade_verifications gv
  join public.profiles p on p.id = gv.profile_id
  where gv.status = 'pending'
  order by gv.created_at asc;
end;
$$;

create or replace function public.admin_review_grade_verification(
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
  perform public.require_admin_console_access();
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED' using errcode = '42501';
  end if;

  select profile_id, gpa into target_profile, target_gpa
  from public.grade_verifications
  where id = verification_id and status = 'pending'
  for update;

  if target_profile is null then
    raise exception 'VERIFICATION_NOT_PENDING';
  end if;

  update public.grade_verifications
  set status = case when approve then 'approved' else 'rejected' end::public.grade_verification_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(note), '')
  where id = verification_id;

  if approve then
    update public.profiles
    set gpa = target_gpa, gpa_verified = true
    where id = target_profile;
  end if;
end;
$$;

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

-- Explicitly enforce active status on public posting/commenting.
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own
on public.posts for update to authenticated
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
on public.comments for update to authenticated
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
);

revoke all on function public.admin_list_reports(text, boolean) from public, anon;
revoke all on function public.admin_update_report(uuid, text, text) from public, anon;
revoke all on function public.admin_moderate_user(uuid, text, text, uuid) from public, anon;
revoke all on function public.admin_list_grade_verifications() from public, anon;
revoke all on function public.admin_review_grade_verification(uuid, boolean, text) from public, anon;

grant execute on function public.admin_list_reports(text, boolean) to authenticated;
grant execute on function public.admin_update_report(uuid, text, text) to authenticated;
grant execute on function public.admin_moderate_user(uuid, text, text, uuid) to authenticated;
grant execute on function public.admin_list_grade_verifications() to authenticated;
grant execute on function public.admin_review_grade_verification(uuid, boolean, text) to authenticated;
