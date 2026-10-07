-- Read report email configuration from Supabase Vault.
-- Secrets are inserted outside version control and this function is callable only by service_role.

create or replace function public.get_report_email_config()
returns table (
  resend_api_key text,
  report_from_email text,
  moderator_email text,
  app_url text
)
language sql
security definer
set search_path = public, vault
as $$
  select
    max(case when name = 'RESEND_API_KEY' then decrypted_secret end),
    max(case when name = 'REPORT_FROM_EMAIL' then decrypted_secret end),
    max(case when name = 'MODERATOR_EMAIL' then decrypted_secret end),
    max(case when name = 'APP_URL' then decrypted_secret end)
  from vault.decrypted_secrets
  where name in ('RESEND_API_KEY','REPORT_FROM_EMAIL','MODERATOR_EMAIL','APP_URL');
$$;

revoke all on function public.get_report_email_config() from public, anon, authenticated;
grant execute on function public.get_report_email_config() to service_role;
