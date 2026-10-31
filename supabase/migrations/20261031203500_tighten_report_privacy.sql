-- Tighten moderation privacy:
-- reporters may upload evidence, but only moderators may read it.
-- reports themselves are write-only for normal authenticated users.

drop policy if exists report_evidence_owner_read on storage.objects;
drop policy if exists report_evidence_moderator_read on storage.objects;

create policy report_evidence_moderator_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'report-evidence'
  and public.is_moderator()
);

drop policy if exists reports_read_own on public.reports;

revoke select, update, delete on table public.reports from authenticated;
grant insert on table public.reports to authenticated;
