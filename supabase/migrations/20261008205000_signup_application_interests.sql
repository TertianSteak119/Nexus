create or replace function public.list_signup_interests()
returns table (
  id uuid,
  name text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.name
  from public.interests i
  order by i.name;
$$;

revoke all on function public.list_signup_interests() from public;
grant execute on function public.list_signup_interests() to anon, authenticated;
