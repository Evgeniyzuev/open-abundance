update public.reminder_jobs
set status = 'cancelled',
    updated_at = now()
where kind = 'inbox_review';

alter table public.reminder_jobs
drop constraint if exists reminder_jobs_kind_check;

update public.reminder_jobs
set kind = 'today_daily', updated_at = now()
where kind = 'inbox_review';

alter table public.reminder_jobs
add constraint reminder_jobs_kind_check check (kind in ('action', 'today_daily'));

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-reflection-reminders') then
    perform cron.unschedule('open-abundance-reflection-reminders');
  end if;
  if exists (select 1 from cron.job where jobname = 'open-abundance-reminders') then
    perform cron.unschedule('open-abundance-reminders');
  end if;
end;
$$;

create or replace function public.invoke_reminder_dispatch()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  project_url text;
  cron_secret text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'reflection_reminder_cron_secret'
  limit 1;

  if project_url is null or cron_secret is null then
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-reflection-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.invoke_reminder_dispatch() from public, anon, authenticated;

select cron.schedule(
  'open-abundance-reminders',
  '* * * * *',
  $$select public.invoke_reminder_dispatch();$$
);

insert into public.challenges (
  id,
  title,
  description,
  instructions,
  requirements,
  reward_label,
  category,
  difficulty_level,
  duration_days,
  image_url,
  verification_type,
  verification_logic,
  sort_order,
  action_view
) values
(
  '4d0c22da-13b8-4ac9-84cf-d2b64ced96eb',
  '{"en":"Today: 7 Days in a Row","ru":"Today: 7 дней подряд"}'::jsonb,
  '{"en":"Complete your personal Today challenge for seven consecutive local days.","ru":"Заверши личный Today challenge семь локальных календарных дней подряд."}'::jsonb,
  '{"en":"Reach the daily Core target and check Today each day. An unfinished current day does not break yesterday''s active streak.","ru":"Каждый день достигай дневной цели Core и проверяй Today. Незавершённый текущий день не обрывает активную серию за вчера."}'::jsonb,
  '{"en":"An active Today completion streak of at least 7 days.","ru":"Активная серия завершённых Today не менее 7 дней."}'::jsonb,
  '{"en":"Core +7$","ru":"Core +7$"}'::jsonb,
  'focus',
  2,
  7,
  null,
  'auto',
  'today_completion_streak_7',
  69,
  'home'
),
(
  'b63e09cf-1bcd-4b51-9466-87fdb027e943',
  '{"en":"Today: 30 Completed Days","ru":"Today: 30 выполненных дней"}'::jsonb,
  '{"en":"Complete your personal Today challenge on thirty days in total.","ru":"Заверши личный Today challenge в сумме за тридцать дней."}'::jsonb,
  '{"en":"Keep reaching the daily Core target. The thirty completed days do not have to be consecutive.","ru":"Продолжай достигать дневной цели Core. Тридцать выполненных дней не обязаны идти подряд."}'::jsonb,
  '{"en":"At least 30 completed Today instances in total.","ru":"Не менее 30 завершённых Today за всё время."}'::jsonb,
  '{"en":"Core +10$","ru":"Core +10$"}'::jsonb,
  'focus',
  3,
  30,
  null,
  'auto',
  'today_completion_total_30',
  70,
  'home'
)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  instructions = excluded.instructions,
  requirements = excluded.requirements,
  reward_label = excluded.reward_label,
  category = excluded.category,
  difficulty_level = excluded.difficulty_level,
  duration_days = excluded.duration_days,
  image_url = excluded.image_url,
  verification_type = excluded.verification_type,
  verification_logic = excluded.verification_logic,
  sort_order = excluded.sort_order,
  action_view = excluded.action_view,
  is_active = true;
