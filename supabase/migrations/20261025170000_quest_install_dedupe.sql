-- "Install the app" is path step 3 now, so the older side quest with timed install pings repeated it. Nobody has taken
-- it since it was restored on 2026-10-25; it is switched off rather than deleted.
update public.challenges
set is_active = false
where id = '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a03'
  and not exists (select 1 from public.user_challenges where challenge_id = '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a03');
