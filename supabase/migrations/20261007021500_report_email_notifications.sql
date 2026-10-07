-- Phase 7 report email delivery queue + automatic trigger.
-- The Edge Function reads RESEND_API_KEY from Supabase secrets and uses
-- REPORT_FROM_EMAIL only as configuration, so changing domains later requires no code rewrite.

create table if not exists public.report_notifications (
  report_id uuid primary key references public.reports(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.report_notifications enable row level security;
revoke all on table public.report_notifications from public, anon, authenticated;

create extension if not exists pg_net with schema extensions;

create or replace function public.enqueue_report_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://bhxpsfwfvhjlovijlvcs.supabase.co/functions/v1/notify-report',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('report_id', new.id)
  );
  return new;
end;
$$;

revoke all on function public.enqueue_report_notification() from public, anon, authenticated;

drop trigger if exists reports_notify_email on public.reports;
create trigger reports_notify_email
after insert on public.reports
for each row execute procedure public.enqueue_report_notification();
