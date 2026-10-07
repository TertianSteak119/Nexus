-- One-time email actions for owner account approval.
-- Links are never state-changing on GET so email security scanners cannot approve/reject accounts.

create table if not exists public.account_approval_email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('approve','reject')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_approval_email_tokens_user_idx
  on public.account_approval_email_tokens(user_id, created_at desc);

alter table public.account_approval_email_tokens enable row level security;
revoke all on table public.account_approval_email_tokens from public, anon, authenticated;
