-- Run after the first manager signs in with Google. Replace the email placeholder.
insert into public.members(id,role)
select id,'manager'
from auth.users
where lower(email)=lower('replace-with-manager-google-email@example.com')
on conflict(id) do update set role=excluded.role;
