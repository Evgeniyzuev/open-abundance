-- Reuse the project's shared updated_at trigger helper.
-- The preceding Teams migration created a duplicate helper for these two
-- tables; replace its triggers before removing that helper.

drop trigger if exists touch_team_task_revisions_updated_at on public.team_task_revisions;
create trigger touch_team_task_revisions_updated_at
before update on public.team_task_revisions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_team_task_help_updated_at on public.team_task_help_requests;
create trigger touch_team_task_help_updated_at
before update on public.team_task_help_requests
for each row execute function public.touch_updated_at();

drop function if exists public.touch_team_task_collaboration_updated_at();
