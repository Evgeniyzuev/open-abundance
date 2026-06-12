drop policy if exists "Users can view their own project applications" on public.project_applications;
drop policy if exists "Project owners can view project applications" on public.project_applications;
drop policy if exists "Users and project owners can view project applications" on public.project_applications;
create policy "Users and project owners can view project applications"
on public.project_applications
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.projects
    where projects.id = project_applications.project_id
      and projects.owner_id = (select auth.uid())
  )
);

drop policy if exists "Project owners can manage project tasks" on public.project_tasks;
drop policy if exists "Project owners can create project tasks" on public.project_tasks;
create policy "Project owners can create project tasks"
on public.project_tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects
    where projects.id = project_tasks.project_id
      and projects.owner_id = (select auth.uid())
  )
);

drop policy if exists "Project owners can update project tasks" on public.project_tasks;
create policy "Project owners can update project tasks"
on public.project_tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = project_tasks.project_id
      and projects.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.projects
    where projects.id = project_tasks.project_id
      and projects.owner_id = (select auth.uid())
  )
);

drop policy if exists "Project owners can delete project tasks" on public.project_tasks;
create policy "Project owners can delete project tasks"
on public.project_tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = project_tasks.project_id
      and projects.owner_id = (select auth.uid())
  )
);

create index if not exists idx_projects_owner
on public.projects (owner_id);

create or replace function public.handle_projects_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
