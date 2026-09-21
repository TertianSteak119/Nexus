create type public.school_level as enum ('secundaria', 'preparatoria', 'universidad');
create type public.profile_looking_for_kind as enum ('friends', 'projects', 'study_groups', 'other');
create type public.grade_verification_status as enum ('pending', 'approved', 'rejected');
create type public.profile_role as enum ('user', 'moderator');
create type public.profile_status as enum ('active', 'suspended', 'banned');

create or replace function public.age_space(birth_date date)
returns text
language sql
stable
strict
as $$
  select case
    when extract(year from age(current_date, birth_date)) between 12 and 17 then 'teen'
    when extract(year from age(current_date, birth_date)) >= 18 then 'adult'
    else null
  end
$$;

create or replace function public.current_age_space()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.age_space(birth_date)
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.same_space(first_profile uuid, second_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.age_space(first_birth_date) = public.age_space(second_birth_date)
  from (
    select
      (select birth_date from public.profiles where id = first_profile) as first_birth_date,
      (select birth_date from public.profiles where id = second_profile) as second_birth_date
  ) dates
  where first_birth_date is not null and second_birth_date is not null
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'moderator' and status = 'active'
  )
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  full_name text not null check (char_length(trim(full_name)) between 2 and 80),
  avatar_path text,
  bio text check (bio is null or char_length(bio) <= 500),
  birth_date date not null check (public.age_space(birth_date) is not null),
  school_level public.school_level not null,
  school_name text not null check (char_length(trim(school_name)) between 2 and 120),
  gpa numeric(4, 2) check (gpa is null or (gpa >= 0 and gpa <= 10)),
  gpa_verified boolean not null default false,
  accepts_message_requests boolean not null default true,
  role public.profile_role not null default 'user',
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 50),
  created_at timestamptz not null default now()
);

create table public.profile_interests (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  primary key (profile_id, interest_id)
);

create table public.profile_looking_for (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.profile_looking_for_kind not null,
  other_text text check (other_text is null or char_length(trim(other_text)) <= 120),
  primary key (profile_id, kind),
  check ((kind = 'other' and other_text is not null and char_length(trim(other_text)) > 0) or kind <> 'other')
);

create table public.grade_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  gpa numeric(4, 2) not null check (gpa >= 0 and gpa <= 10),
  image_path text not null,
  status public.grade_verification_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index profiles_birth_date_idx on public.profiles (birth_date);
create index profiles_username_idx on public.profiles (username);
create index grade_verifications_status_idx on public.grade_verifications (status);

alter table public.profiles enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.profile_looking_for enable row level security;
alter table public.grade_verifications enable row level security;

create policy "profiles_select_same_space"
  on public.profiles for select to authenticated
  using (public.same_space(auth.uid(), id) and status <> 'banned');

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and public.age_space(birth_date) is not null);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and public.age_space(birth_date) is not null);

create policy "interests_read_authenticated"
  on public.interests for select to authenticated using (true);

create policy "interests_manage_moderator"
  on public.interests for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

create policy "profile_interests_same_space"
  on public.profile_interests for select to authenticated
  using (public.same_space(auth.uid(), profile_id));

create policy "profile_interests_own_write"
  on public.profile_interests for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "profile_looking_for_same_space"
  on public.profile_looking_for for select to authenticated
  using (public.same_space(auth.uid(), profile_id));

create policy "profile_looking_for_own_write"
  on public.profile_looking_for for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "grade_verifications_owner_read"
  on public.grade_verifications for select to authenticated
  using (profile_id = auth.uid() or public.is_moderator());

create policy "grade_verifications_owner_insert"
  on public.grade_verifications for insert to authenticated
  with check (profile_id = auth.uid() and status = 'pending');

create policy "grade_verifications_moderator_update"
  on public.grade_verifications for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

create or replace function public.prevent_profile_privilege_changes()
returns trigger
language plpgsql
as $$
begin
  if not public.is_moderator() then
    new.role := old.role;
    new.status := old.status;
    new.gpa_verified := old.gpa_verified;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute procedure public.prevent_profile_privilege_changes();

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('boletas', 'boletas', false)
on conflict (id) do nothing;

create policy "avatar_owner_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "boleta_owner_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'boletas' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "boleta_owner_or_moderator_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'boletas' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));