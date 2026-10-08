create table if not exists public.password_reset_throttle (
  email_hash text primary key,
  last_requested_at timestamptz not null default now()
);

alter table public.password_reset_throttle enable row level security;
revoke all on table public.password_reset_throttle from public, anon, authenticated;
