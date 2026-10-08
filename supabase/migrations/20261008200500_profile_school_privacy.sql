-- Privacy preference for showing the school name on public profiles.
alter table public.profiles
  add column if not exists show_school_public boolean not null default true;
