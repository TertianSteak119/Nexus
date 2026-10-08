-- Moderator-facing account application queue.
-- This is separate from the secret admin console and is available only to moderator-role accounts.

create or replace function public.moderator_pending_account_approvals_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  return (
    select count(*)::integer
    from public.account_approvals
    where status = 'pending'
  );
end;
$$;

drop function if exists public.moderator_list_account_approvals();

create function public.moderator_list_account_approvals()
returns table (
  user_id uuid,
  email text,
  full_name text,
  status text,
  requested_at timestamptz,
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
  grade_evidence_path text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  return query
  select
    a.user_id,
    u.email::text,
    coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name', 'Sin nombre')::text,
    a.status,
    a.requested_at,
    public.is_profile_application_complete(a.user_id),
    p.username,
    p.birth_date,
    case
      when p.birth_date is null then null
      else extract(year from age(current_date, p.birth_date))::integer
    end,
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
    gv.image_path
  from public.account_approvals a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  left join lateral (
    select g.image_path
    from public.grade_verifications g
    where g.profile_id = a.user_id
    order by g.created_at desc
    limit 1
  ) gv on true
  where a.status = 'pending'
  order by a.requested_at desc;
end;
$$;

create or replace function public.moderator_review_account_approval(
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
  if not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  perform public.complete_account_approval(target_user, approve, auth.uid(), note);
end;
$$;

revoke all on function public.moderator_pending_account_approvals_count() from public, anon;
revoke all on function public.moderator_list_account_approvals() from public, anon;
revoke all on function public.moderator_review_account_approval(uuid, boolean, text) from public, anon;

grant execute on function public.moderator_pending_account_approvals_count() to authenticated;
grant execute on function public.moderator_list_account_approvals() to authenticated;
grant execute on function public.moderator_review_account_approval(uuid, boolean, text) to authenticated;
