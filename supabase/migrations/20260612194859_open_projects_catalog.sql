create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  instructions jsonb not null default '{}'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  category text not null default 'community',
  level integer not null default 1,
  max_participants integer not null default 0,
  current_participants integer not null default 0,
  deadline timestamptz,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text not null default 'Open Abundance',
  image_url text,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  message text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  reward_label jsonb not null default '{}'::jsonb,
  difficulty_level integer not null default 1,
  verification_type text not null default 'community' check (verification_type in ('auto', 'manual', 'community')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.project_applications enable row level security;
alter table public.project_tasks enable row level security;

drop policy if exists "Everyone can view active projects" on public.projects;
create policy "Everyone can view active projects"
on public.projects
for select
using (is_active = true);

drop policy if exists "Authenticated users can create projects" on public.projects;
create policy "Authenticated users can create projects"
on public.projects
for insert
to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists "Project owners can update projects" on public.projects;
create policy "Project owners can update projects"
on public.projects
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

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

drop policy if exists "Users can apply to projects" on public.project_applications;
create policy "Users can apply to projects"
on public.project_applications
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own project applications" on public.project_applications;
create policy "Users can update their own project applications"
on public.project_applications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Everyone can view active project tasks" on public.project_tasks;
create policy "Everyone can view active project tasks"
on public.project_tasks
for select
using (
  is_active = true
  and exists (
    select 1
    from public.projects
    where projects.id = project_tasks.project_id
      and projects.is_active = true
  )
);

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

create index if not exists idx_projects_active_priority
on public.projects (is_active, priority desc, created_at desc);

create index if not exists idx_projects_owner
on public.projects (owner_id);

create index if not exists idx_project_applications_user
on public.project_applications (user_id, status, updated_at desc);

create index if not exists idx_project_applications_project
on public.project_applications (project_id, status, updated_at desc);

create index if not exists idx_project_tasks_project_sort
on public.project_tasks (project_id, is_active, sort_order);

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

drop trigger if exists handle_projects_updated_at on public.projects;
create trigger handle_projects_updated_at
before update on public.projects
for each row
execute function public.handle_projects_updated_at();

drop trigger if exists handle_project_applications_updated_at on public.project_applications;
create trigger handle_project_applications_updated_at
before update on public.project_applications
for each row
execute function public.handle_projects_updated_at();

insert into public.projects (
  id,
  title,
  description,
  instructions,
  requirements,
  category,
  level,
  max_participants,
  current_participants,
  owner_name,
  image_url,
  priority
) values
(
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1001',
  '{"en":"Independent Verifiable Voting","ru":"Независимое проверяемое голосование"}'::jsonb,
  '{"en":"Build open, auditable voting tools where every participant can verify the rules, counting process and final result without trusting a single authority.","ru":"Создать открытую и проверяемую систему голосования, где правила, подсчет и итог можно независимо проверить без доверия к единому центру."}'::jsonb,
  '{"en":"Join research, product design, testing, cryptographic verification, legal framing or community education tasks.","ru":"Можно подключиться к исследованию, дизайну продукта, тестированию, криптографической проверке, юридической рамке или объяснению системы людям."}'::jsonb,
  '{"en":"Interest in transparent governance, auditability or civic technology.","ru":"Интерес к прозрачному управлению, аудиту решений или гражданским технологиям."}'::jsonb,
  'governance',
  1,
  0,
  0,
  'Open Abundance',
  null,
  100
),
(
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1002',
  '{"en":"Personal Sovereignty","ru":"Суверенитет личности"}'::jsonb,
  '{"en":"Create tools and practices that help people own their identity, data, skills, finances and choices in a world of platforms and automation.","ru":"Собрать инструменты и практики, которые помогают человеку владеть своей идентичностью, данными, навыками, финансами и выбором в мире платформ и автоматизации."}'::jsonb,
  '{"en":"Contribute guides, UX flows, privacy patterns, financial literacy tasks or self-reliance experiments.","ru":"Можно делать гайды, UX-сценарии, паттерны приватности, задания по финансовой грамотности и эксперименты самостоятельности."}'::jsonb,
  '{"en":"A practical interest in autonomy, privacy, education or resilient personal systems.","ru":"Практический интерес к автономии, приватности, образованию или устойчивым личным системам."}'::jsonb,
  'self_development',
  1,
  0,
  0,
  'Open Abundance',
  null,
  90
),
(
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1003',
  '{"en":"Make The World A Better Place","ru":"Сделаем мир лучшим местом"}'::jsonb,
  '{"en":"Coordinate small visible improvements: mutual aid, local initiatives, education, ecology, public-good products and everyday acts that compound into trust.","ru":"Координировать небольшие видимые улучшения: взаимопомощь, локальные инициативы, образование, экологию, общественно полезные продукты и действия, которые накапливают доверие."}'::jsonb,
  '{"en":"Pick a concrete problem, document it, invite collaborators and turn it into tasks the community can verify.","ru":"Выберите конкретную проблему, опишите ее, пригласите участников и превратите работу в задания, которые сообщество сможет проверить."}'::jsonb,
  '{"en":"Willingness to do one useful action and show the result publicly.","ru":"Готовность сделать одно полезное действие и публично показать результат."}'::jsonb,
  'public_good',
  1,
  0,
  0,
  'Open Abundance',
  null,
  80
),
(
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1004',
  '{"en":"AI Unemployment -> End Wage Slavery","ru":"ИИ-безработица: конец зарплатного рабства"}'::jsonb,
  '{"en":"Explore how automation can move people from fear of job loss toward ownership, shared capital, useful projects and freedom from survival-only work.","ru":"Исследовать, как автоматизация может перевести людей от страха потери работы к владению, общему капиталу, полезным проектам и свободе от работы только ради выживания."}'::jsonb,
  '{"en":"Help with research, educational challenges, alternative income experiments, cooperative models and stories of people adapting with AI.","ru":"Помогайте исследованием, образовательными челленджами, экспериментами альтернативного дохода, кооперативными моделями и историями людей, которые адаптируются с ИИ."}'::jsonb,
  '{"en":"Curiosity about AI, economics, work, ownership and practical transition paths.","ru":"Интерес к ИИ, экономике, труду, владению и практическим маршрутам перехода."}'::jsonb,
  'future_of_work',
  1,
  0,
  0,
  'Open Abundance',
  null,
  70
)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  instructions = excluded.instructions,
  requirements = excluded.requirements,
  category = excluded.category,
  level = excluded.level,
  max_participants = excluded.max_participants,
  owner_name = excluded.owner_name,
  image_url = excluded.image_url,
  priority = excluded.priority,
  is_active = true,
  updated_at = now();

insert into public.project_tasks (
  id,
  project_id,
  title,
  description,
  reward_label,
  difficulty_level,
  verification_type,
  sort_order
) values
(
  '6f9da5a8-0a9a-4f21-85c8-5d9fe5c71001',
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1001',
  '{"en":"Map Existing Voting Tools","ru":"Карта существующих систем голосования"}'::jsonb,
  '{"en":"Collect 3-5 examples of verifiable voting systems and note what each one proves well or poorly.","ru":"Соберите 3-5 примеров проверяемых систем голосования и отметьте, что каждая хорошо или плохо доказывает."}'::jsonb,
  '{"en":"+1 core after review","ru":"+1 ядро после проверки"}'::jsonb,
  1,
  'community',
  10
),
(
  '6f9da5a8-0a9a-4f21-85c8-5d9fe5c71002',
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1002',
  '{"en":"Personal Sovereignty Checklist","ru":"Чеклист личного суверенитета"}'::jsonb,
  '{"en":"Draft a compact checklist for identity, data, money, skills and communication resilience.","ru":"Составьте короткий чеклист по идентичности, данным, деньгам, навыкам и устойчивой коммуникации."}'::jsonb,
  '{"en":"+1 core after review","ru":"+1 ядро после проверки"}'::jsonb,
  1,
  'community',
  10
),
(
  '6f9da5a8-0a9a-4f21-85c8-5d9fe5c71003',
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1003',
  '{"en":"One Visible Improvement","ru":"Одно видимое улучшение"}'::jsonb,
  '{"en":"Choose one local or online improvement, do the first useful action and publish proof in the feed.","ru":"Выберите одно локальное или онлайн-улучшение, сделайте первое полезное действие и опубликуйте подтверждение в ленте."}'::jsonb,
  '{"en":"+1 core after review","ru":"+1 ядро после проверки"}'::jsonb,
  1,
  'community',
  10
),
(
  '6f9da5a8-0a9a-4f21-85c8-5d9fe5c71004',
  '9b0f4180-3c42-4a4f-8f52-9a2d9adf1004',
  '{"en":"AI Transition Notes","ru":"Заметки о переходе в эпоху ИИ"}'::jsonb,
  '{"en":"Write a short note about one job task AI can automate and one new ownership or project path it can open.","ru":"Напишите короткую заметку: какую рабочую задачу ИИ автоматизирует и какой новый путь владения или проекта это открывает."}'::jsonb,
  '{"en":"+1 core after review","ru":"+1 ядро после проверки"}'::jsonb,
  1,
  'community',
  10
)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  reward_label = excluded.reward_label,
  difficulty_level = excluded.difficulty_level,
  verification_type = excluded.verification_type,
  sort_order = excluded.sort_order,
  is_active = true;
