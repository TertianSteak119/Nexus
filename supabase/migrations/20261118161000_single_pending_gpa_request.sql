-- Prevent duplicate pending GPA requests and retire older duplicates when one is approved.

create or replace function public.prevent_duplicate_pending_grade_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending'
     and exists (
       select 1
       from public.grade_verifications gv
       where gv.profile_id = new.profile_id
         and gv.status = 'pending'
         and gv.id <> new.id
     ) then
    raise exception 'GRADE_VERIFICATION_ALREADY_PENDING';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_pending_grade_verification_trigger
on public.grade_verifications;

create trigger prevent_duplicate_pending_grade_verification_trigger
before insert or update of status, profile_id
on public.grade_verifications
for each row
execute function public.prevent_duplicate_pending_grade_verification();

create or replace function public.moderator_review_grade_verification(
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
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  select gv.profile_id, gv.gpa
  into target_profile, target_gpa
  from public.grade_verifications gv
  where gv.id = verification_id
    and gv.status = 'pending'
  for update;

  if target_profile is null then
    raise exception 'VERIFICATION_NOT_PENDING';
  end if;

  update public.grade_verifications
  set
    status = case when approve then 'approved' else 'rejected' end::public.grade_verification_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(trim(note), '')
  where id = verification_id;

  if approve then
    update public.grade_verifications
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = 'Sustituida por una solicitud de promedio aprobada más reciente.'
    where profile_id = target_profile
      and id <> verification_id
      and status = 'pending';

    update public.profiles
    set
      gpa = target_gpa,
      gpa_verified = true,
      updated_at = now()
    where id = target_profile;
  end if;
end;
$$;

revoke all on function public.moderator_review_grade_verification(uuid, boolean, text) from public, anon;
grant execute on function public.moderator_review_grade_verification(uuid, boolean, text) to authenticated;
