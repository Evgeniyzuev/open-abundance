create index if not exists user_today_instances_core_growth_plan_idx
on public.user_today_instances (core_growth_plan_id)
where core_growth_plan_id is not null;
