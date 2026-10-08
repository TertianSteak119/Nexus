-- Profile-first account applications.
-- Pending users may prepare their application, but remain unable to use Nexus
-- until the owner approves the completed application.

create or replace function public.can_prepare_account_application(target_user uuid default auth.uid())
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
      and a.status in ('pending', 'approved')
  );
$$;

revoke all on function public.can_prepare_account_application(uuid) from public, anon;
grant execute on function public.can_prepare_account_application(uuid) to authenticated;

create or replace function public.is_profile_application_complete(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = target_user
        and p.gpa is not null
        and char_length(trim(p.username)) >= 3
        and char_length(trim(p.full_name)) >= 2
        and char_length(trim(p.school_name)) >= 2
    )
    and exists (
      select 1 from public.profile_interests pi where pi.profile_id = target_user
    )
    and exists (
      select 1 from public.profile_looking_for plf where plf.profile_id = target_user
    )
    and exists (
      select 1 from public.grade_verifications gv where gv.profile_id = target_user
    );
$$;

revoke all on function public.is_profile_application_complete(uuid) from public, anon;
grant execute on function public.is_profile_application_complete(uuid) to authenticated;

create or replace function public.prepare_pending_profile_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_approved(new.id) then
    new.status := 'suspended';
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_pending_profile_status() from public, anon, authenticated;

drop trigger if exists prepare_pending_profile_status on public.profiles;
create trigger prepare_pending_profile_status
before insert on public.profiles
for each row execute procedure public.prepare_pending_profile_status();

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and public.can_prepare_account_application(auth.uid())
  and public.age_space(birth_date) is not null
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  and public.can_prepare_account_application(auth.uid())
)
with check (
  id = auth.uid()
  and public.can_prepare_account_application(auth.uid())
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
  and public.can_prepare_account_application(auth.uid())
);

drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_prepare_account_application(auth.uid())
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_prepare_account_application(auth.uid())
);

drop policy if exists "boleta_owner_upload" on storage.objects;
create policy "boleta_owner_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'boletas'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_prepare_account_application(auth.uid())
);

create or replace function public.admin_list_account_approvals()
returns table (
  user_id uuid,
  email text,
  full_name text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  application_complete boolean,
  username text,
  birth_date date,
  age integer,
  school_level public.school_level,
  school_name text,
  gpa numeric,
  bio text,
  avatar_path text,
  accepts_message_requests boolean,
  interests text[],
  looking_for text[],
  grade_verification_id uuid,
  grade_verification_status public.grade_verification_status,
  grade_evidence_path text
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
    coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name', 'Sin nombre')::text,
    a.status,
    a.requested_at,
    a.reviewed_at,
    a.review_note,
    public.is_profile_application_complete(a.user_id),
    p.username,
    p.birth_date,
    case when p.birth_date is null then null else extract(year from age(current_date, p.birth_date))::integer end,
    p.school_level,
    p.school_name,
    p.gpa,
    p.bio,
    p.avatar_path,
    p.accepts_message_requests,
    coalesce((
      select array_agg(i.name order by i.name)
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.profile_id = a.user_id
    ), array[]::text[]),
    coalesce((
      select array_agg(
        case
          when plf.kind = 'other' then 'Otro: ' || coalesce(plf.other_text, '')
          when plf.kind = 'friends' then 'Amigos'
          when plf.kind = 'projects' then 'Proyectos'
          when plf.kind = 'study_groups' then 'Grupos de estudio'
          else plf.kind::text
        end
        order by plf.kind::text
      )
      from public.profile_looking_for plf
      where plf.profile_id = a.user_id
    ), array[]::text[]),
    gv.id,
    gv.status,
    gv.image_path
  from public.account_approvals a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  left join lateral (
    select g.id, g.status, g.image_path
    from public.grade_verifications g
    where g.profile_id = a.user_id
    order by g.created_at desc
    limit 1
  ) gv on true
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
declare
  latest_verification uuid;
begin
  perform public.require_admin_console_access();

  if approve and not public.is_profile_application_complete(target_user) then
    raise exception 'ACCOUNT_APPLICATION_INCOMPLETE';
  end if;

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

  if approve then
    select g.id
    into latest_verification
    from public.grade_verifications g
    where g.profile_id = target_user
    order by g.created_at desc
    limit 1;

    if latest_verification is not null then
      update public.grade_verifications
      set status = 'approved',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          review_note = coalesce(nullif(trim(note), ''), 'Verificado durante la aprobación de ingreso.')
      where id = latest_verification;

      update public.profiles
      set status = 'active',
          gpa_verified = true,
          updated_at = now()
      where id = target_user;
    end if;
  end if;
end;
$$;

revoke all on function public.admin_list_account_approvals() from public, anon;
revoke all on function public.admin_review_account_approval(uuid, boolean, text) from public, anon;
grant execute on function public.admin_list_account_approvals() to authenticated;
grant execute on function public.admin_review_account_approval(uuid, boolean, text) to authenticated;
