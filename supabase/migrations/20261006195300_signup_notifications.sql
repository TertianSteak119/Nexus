create table if not exists public.signup_notifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  last_error text
);

alter table public.signup_notifications enable row level security;

revoke all on table public.signup_notifications from anon, authenticated;
