alter table public.feed_posts
drop constraint if exists feed_posts_post_type_check;

alter table public.feed_posts
add constraint feed_posts_post_type_check
check (post_type in ('daily_progress', 'manual', 'external_link', 'wish', 'reality_demo'));

alter table public.feed_posts
  alter column author_user_id drop not null,
  add column if not exists source_key text,
  add column if not exists author_label text;

alter table public.feed_posts
drop constraint if exists feed_posts_author_source_check;

alter table public.feed_posts
add constraint feed_posts_author_source_check
check (author_user_id is not null or source_key is not null);

create unique index if not exists feed_posts_source_key_uidx
on public.feed_posts (source_key)
where source_key is not null;

create table if not exists public.feed_post_translations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  locale text not null check (locale in ('ru', 'en')),
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, locale)
);

create index if not exists feed_post_translations_post_locale_idx
on public.feed_post_translations (post_id, locale);

create table if not exists public.feed_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  media_url text not null,
  thumbnail_url text,
  alt_text jsonb not null default '{}'::jsonb,
  source_url text,
  source_label text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

create index if not exists feed_post_media_post_sort_idx
on public.feed_post_media (post_id, sort_order);

alter table public.feed_post_translations enable row level security;
alter table public.feed_post_media enable row level security;

grant select, insert, update, delete on table public.feed_post_translations to authenticated, service_role;
grant select, insert, update, delete on table public.feed_post_media to authenticated, service_role;

drop policy if exists "Users can read visible feed translations" on public.feed_post_translations;
create policy "Users can read visible feed translations"
on public.feed_post_translations
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_translations.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (post.status = 'published' and post.visibility = 'public')
      )
  )
);

drop policy if exists "Users can insert own feed translations" on public.feed_post_translations;
create policy "Users can insert own feed translations"
on public.feed_post_translations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_translations.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
);

drop policy if exists "Users can update own feed translations" on public.feed_post_translations;
create policy "Users can update own feed translations"
on public.feed_post_translations
for update
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_translations.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_translations.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
);

drop policy if exists "Users can delete own feed translations" on public.feed_post_translations;
create policy "Users can delete own feed translations"
on public.feed_post_translations
for delete
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_translations.post_id
      and post.author_user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read visible feed media" on public.feed_post_media;
create policy "Users can read visible feed media"
on public.feed_post_media
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_media.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (post.status = 'published' and post.visibility = 'public')
      )
  )
);

drop policy if exists "Users can insert own feed media" on public.feed_post_media;
create policy "Users can insert own feed media"
on public.feed_post_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_media.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
);

drop policy if exists "Users can update own feed media" on public.feed_post_media;
create policy "Users can update own feed media"
on public.feed_post_media
for update
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_media.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_media.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
);

drop policy if exists "Users can delete own feed media" on public.feed_post_media;
create policy "Users can delete own feed media"
on public.feed_post_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_media.post_id
      and post.author_user_id = (select auth.uid())
  )
);

drop trigger if exists touch_feed_post_translations_updated_at on public.feed_post_translations;
create trigger touch_feed_post_translations_updated_at
before update on public.feed_post_translations
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_feed_post_media_updated_at on public.feed_post_media;
create trigger touch_feed_post_media_updated_at
before update on public.feed_post_media
for each row
execute function public.touch_updated_at();

insert into public.feed_posts (
  id,
  author_user_id,
  source_key,
  author_label,
  post_type,
  status,
  visibility,
  body,
  created_at,
  published_at
)
values
  ('a1700000-0000-4000-8000-000000000001', null, 'reality_demo:from-burnout-to-freelance', 'Ирина · демо-история', 'reality_demo', 'published', 'public', 'Еще год назад я просыпалась с тяжестью от мысли о работе. Я начала с одного маленького заказа по вечерам, собрала портфолио из того, что уже умела, и постепенно перешла на свободный график. Теперь я сама выбираю рабочие блоки и наконец путешествую без чувства, что жизнь проходит где-то рядом.', now() - interval '0 hours', now() - interval '0 hours'),
  ('a1700000-0000-4000-8000-000000000002', null, 'reality_demo:small-town-remote-career', 'Максим · демо-история', 'reality_demo', 'published', 'public', 'Я долго думал, что для нормальной карьеры обязан уехать из родного города. Вместо переезда я выбрал один востребованный навык, учился на маленьких проектах и нашел удаленных клиентов. Сейчас я рядом с близкими, работаю спокойно и впервые чувствую, что место жизни выбираю я.', now() - interval '6 hours', now() - interval '6 hours'),
  ('a1700000-0000-4000-8000-000000000003', null, 'reality_demo:designer-second-career', 'Лена · демо-история', 'reality_demo', 'published', 'public', 'Мне казалось, что годы в координации проектов пропали зря. Потом я увидела, сколько там было полезного для UX: умение слушать, замечать проблемы и собирать людей вокруг решения. После трех учебных кейсов пришли первые задачи, и теперь мой прошлый опыт не держит меня — он помогает мне расти в любимой профессии.', now() - interval '12 hours', now() - interval '12 hours'),
  ('a1700000-0000-4000-8000-000000000004', null, 'reality_demo:parent-flexible-income', 'Ольга · демо-история', 'reality_demo', 'published', 'public', 'Я устала чувствовать вину и перед семьей, и перед собой. Оставила только самые сильные услуги, разбила работу на короткие окна и честно обозначила клиентам границы. Теперь я не выбираю между близкими и своим развитием: у меня есть гибкий доход, понятные цели и время быть рядом.', now() - interval '18 hours', now() - interval '18 hours'),
  ('a1700000-0000-4000-8000-000000000005', null, 'reality_demo:teacher-independent-practice', 'Аня · демо-история', 'reality_demo', 'published', 'public', 'Школьное расписание забирало все силы, хотя преподавать я по-прежнему любила. Я собрала собственную программу, начала с нескольких учеников и осторожно добавила онлайн-группы. Сейчас сама определяю нагрузку, вижу прогресс учеников и снова чувствую радость от своей профессии.', now() - interval '24 hours', now() - interval '24 hours'),
  ('a1700000-0000-4000-8000-000000000006', null, 'reality_demo:maker-to-small-brand', 'Саша · демо-история', 'reality_demo', 'published', 'public', 'Сначала я делал вещи только для друзей и боялся называть это делом. Потом выбрал одну узнаваемую линейку, стал показывать процесс и выстроил очередь заказов без авралов. Мне нравится просыпаться с желанием идти в мастерскую, а заработок уже помог осуществить давно отложенную поездку.', now() - interval '30 hours', now() - interval '30 hours'),
  ('a1700000-0000-4000-8000-000000000007', null, 'reality_demo:developer-location-freedom', 'Денис · демо-история', 'reality_demo', 'published', 'public', 'Я больше не хотел привязывать всю жизнь к дороге в один офис. Договорился оценивать работу по результату, выстроил асинхронную связь и оставляю паузы между проектами. Теперь могу пожить в другом городе или уехать к морю, не разрушая рабочий ритм и не выпрашивая свободу.', now() - interval '36 hours', now() - interval '36 hours'),
  ('a1700000-0000-4000-8000-000000000008', null, 'reality_demo:local-service-online', 'Мария · демо-история', 'reality_demo', 'published', 'public', 'Раньше каждый пустой день пугал меня: я не знала, когда придет следующий клиент. Я ввела онлайн-запись, понятное описание результата и освободила один день в неделю от работы. Доход стал предсказуемее, а я перестала жить в постоянной тревоге и снова замечаю жизнь за пределами заказов.', now() - interval '42 hours', now() - interval '42 hours'),
  ('a1700000-0000-4000-8000-000000000009', null, 'reality_demo:language-tutor-worldwide', 'Роман · демо-история', 'reality_demo', 'published', 'public', 'Я проводил один и тот же урок десятки раз и чувствовал, что застрял. Сохранил лучшие объяснения, собрал из них программу и добавил самостоятельный формат для учеников из разных часовых поясов. Теперь моя работа не зависит от одного города, а у меня появилось время развивать методику вместо бесконечного повторения.', now() - interval '48 hours', now() - interval '48 hours'),
  ('a1700000-0000-4000-8000-000000000010', null, 'reality_demo:careful-career-exit', 'Павел · демо-история', 'reality_demo', 'published', 'public', 'Каждый понедельник я хотел уволиться, но боялся оставить семью без опоры. Я посчитал безопасный запас, проверил новый навык на небольших задачах и назначил дату решения. Когда этот день пришел, я ушел без паники: не спасался бегством, а выбирал жизнь, которую давно хотел строить.', now() - interval '54 hours', now() - interval '54 hours'),
  ('a1700000-0000-4000-8000-000000000011', null, 'reality_demo:photographer-slow-growth', 'Ника · демо-история', 'reality_demo', 'published', 'public', 'Я соглашалась на любую съемку и постепенно перестала понимать, зачем вообще взяла камеру. Потом собрала любимые работы в одну историю, стала отказываться от чуждых заказов и защитила время для личного проекта. Работы стало не больше, а точнее — и вместе с этим вернулись энергия, уверенность и рост.', now() - interval '60 hours', now() - interval '60 hours'),
  ('a1700000-0000-4000-8000-000000000012', null, 'reality_demo:operations-to-consulting', 'Виктор · демо-история', 'reality_demo', 'published', 'public', 'Я думал, что без должности операционного менеджера мой опыт никому не нужен. Описал свой способ наводить порядок, провел несколько разборов для знакомых команд и увидел реальный эффект. Сейчас мне платят за ясность и результат, а не за часы присутствия, и это дает удивительное чувство независимости.', now() - interval '66 hours', now() - interval '66 hours'),
  ('a1700000-0000-4000-8000-000000000013', null, 'reality_demo:community-to-platform', 'Алина · демо-история', 'reality_demo', 'published', 'public', 'Наш маленький чат рос, а я выгорала, пытаясь держать все на себе. Я сформулировала общую тему, ввела регулярные встречи и передала часть организации участникам. Теперь это живое сообщество, где я тоже получаю поддержку, идеи и новые возможности, а не только бесконечно отдаю силы.', now() - interval '72 hours', now() - interval '72 hours'),
  ('a1700000-0000-4000-8000-000000000014', null, 'reality_demo:researcher-independent-work', 'Тимур · демо-история', 'reality_demo', 'published', 'public', 'Бесконечные срочные задачи не оставляли мне времени по-настоящему думать. Я выбрал узкую тему, начал публиковать наблюдения и перевел проекты в более длинные циклы. Теперь могу глубоко работать, выбирать клиентов и снова чувствую себя исследователем, а не человеком, который только тушит пожары.', now() - interval '78 hours', now() - interval '78 hours'),
  ('a1700000-0000-4000-8000-000000000015', null, 'reality_demo:craftsman-digital-orders', 'Егор · демо-история', 'reality_demo', 'published', 'public', 'Я любил ремесло, но жизнь от срочного заказа до следующего почти уничтожила эту любовь. Убрал непредсказуемые позиции, сделал каталог, научился считать сроки и перестал отвечать по выходным. Теперь дело обеспечивает меня, но не забирает целиком, и я снова горжусь тем, что создаю.', now() - interval '84 hours', now() - interval '84 hours'),
  ('a1700000-0000-4000-8000-000000000016', null, 'reality_demo:career-break-return', 'Светлана · демо-история', 'reality_demo', 'published', 'public', 'После долгой паузы мне казалось, что я безнадежно отстала и никому не нужна. Я честно выписала свои навыки, обновила главное и начала с коротких проектов в удобном графике. Теперь пауза больше не выглядит дырой в биографии — это часть моей истории, после которой я вернулась сильнее и на своих условиях.', now() - interval '90 hours', now() - interval '90 hours'),
  ('a1700000-0000-4000-8000-000000000017', null, 'reality_demo:two-income-paths', 'Кирилл · демо-история', 'reality_demo', 'published', 'public', 'Я долго искал одну идеальную профессию и боялся ошибиться с выбором. В конце концов оставил стабильную работу по сильному навыку и рядом начал развивать небольшой продукт. Две опоры дали мне спокойствие: я могу экспериментировать, менять направление и не ставить все благополучие на одну карту.', now() - interval '96 hours', now() - interval '96 hours'),
  ('a1700000-0000-4000-8000-000000000018', null, 'reality_demo:wellbeing-business', 'Катя · демо-история', 'reality_demo', 'published', 'public', 'Я считала занятые часы доказательством успеха, пока организм не заставил остановиться. Сократила лишние созвоны, оставила задачи, которые дают энергию, и начала планировать отдых так же серьезно, как работу. Сейчас мое дело растет вместе с качеством жизни, и мне больше не приходится платить здоровьем за чувство собственной ценности.', now() - interval '102 hours', now() - interval '102 hours'),
  ('a1700000-0000-4000-8000-000000000019', null, 'reality_demo:traveling-consultant', 'Мила · демо-история', 'reality_demo', 'published', 'public', 'Я годами откладывала путешествия до мифического длинного отпуска. Перевела процессы в удаленный формат, заранее планирую тихие рабочие дни и больше не пытаюсь быть продуктивной каждую минуту поездки. Теперь выбираю следующий город из любопытства, а не для побега, и чувствую, что моя настоящая жизнь уже началась.', now() - interval '108 hours', now() - interval '108 hours'),
  ('a1700000-0000-4000-8000-000000000020', null, 'reality_demo:first-product-launch', 'Артем · демо-история', 'reality_demo', 'published', 'public', 'Я устал снова и снова объяснять клиентам одно и то же и начинать каждый проект с нуля. Выбрал одну понятную проблему, собрал небольшое решение и проверил его на первых пользователях. У продукта появилась собственная жизнь, а у меня — время улучшать его, учиться и думать о будущем, а не только закрывать текущие часы.', now() - interval '114 hours', now() - interval '114 hours'),
  ('a1700000-0000-4000-8000-000000000021', null, 'reality_demo:family-business-modernized', 'Вера · демо-история', 'reality_demo', 'published', 'public', 'Хаотичные заказы в семейном деле держали меня в постоянном напряжении. Я описала процессы, сделала цифровой каталог и ввела день без операционных задач. Теперь я не переживаю каждый вечер, как обеспечить семью: доход стал устойчивее, мне нравится развивать свое направление и не зависеть от работодателя.', now() - interval '120 hours', now() - interval '120 hours'),
  ('a1700000-0000-4000-8000-000000000022', null, 'reality_demo:late-blooming-creator', 'Юрий · демо-история', 'reality_demo', 'published', 'public', 'Я много лет говорил себе, что начинать творческий путь уже поздно. Потом выбрал регулярность вместо грандиозного старта и начал публиковать маленькие работы рядом с основной занятостью. Сейчас у меня есть портфолио, первые заказы и главное — ощущение, что мечта больше не ждет разрешения и растет в моем темпе.', now() - interval '126 hours', now() - interval '126 hours'),
  ('a1700000-0000-4000-8000-000000000023', null, 'reality_demo:dream-home-project', 'Наташа · демо-история', 'reality_demo', 'published', 'public', 'Дом мечты годами существовал только в моей голове и казался слишком большим желанием. Я описала конкретный результат, разбила путь на небольшие шаги и каждую неделю отмечаю прогресс. До цели еще есть дорога, но я больше не чувствую бессилия: эта мечта уже стала частью моей сегодняшней жизни.', now() - interval '132 hours', now() - interval '132 hours')
on conflict (id) do update
set
  source_key = excluded.source_key,
  author_label = excluded.author_label,
  post_type = excluded.post_type,
  status = excluded.status,
  visibility = excluded.visibility,
  body = excluded.body,
  deleted_at = null;

insert into public.feed_post_translations (post_id, locale, author_name, body)
values
  ('a1700000-0000-4000-8000-000000000001', 'ru', 'Ирина · демо-история', 'Еще год назад я просыпалась с тяжестью от мысли о работе. Я начала с одного маленького заказа по вечерам, собрала портфолио из того, что уже умела, и постепенно перешла на свободный график. Теперь я сама выбираю рабочие блоки и наконец путешествую без чувства, что жизнь проходит где-то рядом.'),
  ('a1700000-0000-4000-8000-000000000001', 'en', 'Irina · demo story', 'A year ago, I woke up with a weight in my chest whenever I thought about work. I started with one small evening project, built a portfolio from skills I already had, and gradually moved to a flexible schedule. Now I choose my own work blocks and finally travel without feeling that life is happening somewhere else.'),
  ('a1700000-0000-4000-8000-000000000002', 'ru', 'Максим · демо-история', 'Я долго думал, что для нормальной карьеры обязан уехать из родного города. Вместо переезда я выбрал один востребованный навык, учился на маленьких проектах и нашел удаленных клиентов. Сейчас я рядом с близкими, работаю спокойно и впервые чувствую, что место жизни выбираю я.'),
  ('a1700000-0000-4000-8000-000000000002', 'en', 'Max · demo story', 'For a long time, I believed a real career meant leaving my hometown. Instead, I chose one useful skill, learned through small projects, and found remote clients. I am still close to my family, work at a calmer pace, and finally feel that I choose where I live.'),
  ('a1700000-0000-4000-8000-000000000003', 'ru', 'Лена · демо-история', 'Мне казалось, что годы в координации проектов пропали зря. Потом я увидела, сколько там было полезного для UX: умение слушать, замечать проблемы и собирать людей вокруг решения. После трех учебных кейсов пришли первые задачи, и теперь мой прошлый опыт не держит меня — он помогает мне расти в любимой профессии.'),
  ('a1700000-0000-4000-8000-000000000003', 'en', 'Lena · demo story', 'I thought my years coordinating projects had been wasted. Then I saw how much of that experience belonged in UX: listening, noticing problems, and bringing people around a solution. After three practice cases, my first projects arrived, and now my past is helping me grow in work I actually enjoy.'),
  ('a1700000-0000-4000-8000-000000000004', 'ru', 'Ольга · демо-история', 'Я устала чувствовать вину и перед семьей, и перед собой. Оставила только самые сильные услуги, разбила работу на короткие окна и честно обозначила клиентам границы. Теперь я не выбираю между близкими и своим развитием: у меня есть гибкий доход, понятные цели и время быть рядом.'),
  ('a1700000-0000-4000-8000-000000000004', 'en', 'Olga · demo story', 'I was tired of feeling guilty toward both my family and myself. I kept only my strongest services, split work into short windows, and set honest boundaries with clients. I no longer choose between the people I love and my own growth: I have flexible income, clear goals, and time to be present.'),
  ('a1700000-0000-4000-8000-000000000005', 'ru', 'Аня · демо-история', 'Школьное расписание забирало все силы, хотя преподавать я по-прежнему любила. Я собрала собственную программу, начала с нескольких учеников и осторожно добавила онлайн-группы. Сейчас сама определяю нагрузку, вижу прогресс учеников и снова чувствую радость от своей профессии.'),
  ('a1700000-0000-4000-8000-000000000005', 'en', 'Anya · demo story', 'The school timetable drained all my energy even though I still loved teaching. I built my own program, started with a few students, and carefully added online groups. Now I set my workload, see my students progress, and feel joy in my profession again.'),
  ('a1700000-0000-4000-8000-000000000006', 'ru', 'Саша · демо-история', 'Сначала я делал вещи только для друзей и боялся называть это делом. Потом выбрал одну узнаваемую линейку, стал показывать процесс и выстроил очередь заказов без авралов. Мне нравится просыпаться с желанием идти в мастерскую, а заработок уже помог осуществить давно отложенную поездку.'),
  ('a1700000-0000-4000-8000-000000000006', 'en', 'Sasha · demo story', 'At first, I only made things for friends and was afraid to call it a business. Then I chose one recognizable line, shared the process, and built an order queue without constant emergencies. I love waking up eager to enter the workshop, and the income has already funded a trip I postponed for years.'),
  ('a1700000-0000-4000-8000-000000000007', 'ru', 'Денис · демо-история', 'Я больше не хотел привязывать всю жизнь к дороге в один офис. Договорился оценивать работу по результату, выстроил асинхронную связь и оставляю паузы между проектами. Теперь могу пожить в другом городе или уехать к морю, не разрушая рабочий ритм и не выпрашивая свободу.'),
  ('a1700000-0000-4000-8000-000000000007', 'en', 'Denis · demo story', 'I no longer wanted my whole life tied to commuting to one office. I shifted the focus to outcomes, built asynchronous communication, and left breathing room between projects. Now I can live in another city or spend time by the sea without destroying my work rhythm or asking permission to be free.'),
  ('a1700000-0000-4000-8000-000000000008', 'ru', 'Мария · демо-история', 'Раньше каждый пустой день пугал меня: я не знала, когда придет следующий клиент. Я ввела онлайн-запись, понятное описание результата и освободила один день в неделю от работы. Доход стал предсказуемее, а я перестала жить в постоянной тревоге и снова замечаю жизнь за пределами заказов.'),
  ('a1700000-0000-4000-8000-000000000008', 'en', 'Maria · demo story', 'Every empty day used to scare me because I never knew when the next client would appear. I introduced online booking, made the outcome clear, and protected one day a week from work. Income became more predictable, and I stopped living in constant anxiety and began noticing life beyond orders.'),
  ('a1700000-0000-4000-8000-000000000009', 'ru', 'Роман · демо-история', 'Я проводил один и тот же урок десятки раз и чувствовал, что застрял. Сохранил лучшие объяснения, собрал из них программу и добавил самостоятельный формат для учеников из разных часовых поясов. Теперь моя работа не зависит от одного города, а у меня появилось время развивать методику вместо бесконечного повторения.'),
  ('a1700000-0000-4000-8000-000000000009', 'en', 'Roman · demo story', 'I taught the same lesson dozens of times and felt completely stuck. I saved my best explanations, shaped them into a program, and added a self-paced format for students in different time zones. My work no longer depends on one city, and I have time to improve the method instead of repeating myself forever.'),
  ('a1700000-0000-4000-8000-000000000010', 'ru', 'Павел · демо-история', 'Каждый понедельник я хотел уволиться, но боялся оставить семью без опоры. Я посчитал безопасный запас, проверил новый навык на небольших задачах и назначил дату решения. Когда этот день пришел, я ушел без паники: не спасался бегством, а выбирал жизнь, которую давно хотел строить.'),
  ('a1700000-0000-4000-8000-000000000010', 'en', 'Pavel · demo story', 'Every Monday, I wanted to quit, but I was afraid of leaving my family without support. I calculated a safe buffer, tested a new skill on small projects, and set a decision date. When that day came, I left without panic: I was not escaping, I was choosing the life I had wanted to build for years.'),
  ('a1700000-0000-4000-8000-000000000011', 'ru', 'Ника · демо-история', 'Я соглашалась на любую съемку и постепенно перестала понимать, зачем вообще взяла камеру. Потом собрала любимые работы в одну историю, стала отказываться от чуждых заказов и защитила время для личного проекта. Работы стало не больше, а точнее — и вместе с этим вернулись энергия, уверенность и рост.'),
  ('a1700000-0000-4000-8000-000000000011', 'en', 'Nika · demo story', 'I accepted every shoot and gradually forgot why I had picked up a camera at all. Then I shaped my favorite work into one story, started declining projects that felt wrong, and protected time for something personal. I did not get busier; I became more focused, and energy, confidence, and growth returned with it.'),
  ('a1700000-0000-4000-8000-000000000012', 'ru', 'Виктор · демо-история', 'Я думал, что без должности операционного менеджера мой опыт никому не нужен. Описал свой способ наводить порядок, провел несколько разборов для знакомых команд и увидел реальный эффект. Сейчас мне платят за ясность и результат, а не за часы присутствия, и это дает удивительное чувство независимости.'),
  ('a1700000-0000-4000-8000-000000000012', 'en', 'Victor · demo story', 'I thought my experience was worthless without an operations manager title. I documented how I bring order to messy processes, reviewed a few familiar teams, and saw the effect. Now I am paid for clarity and outcomes instead of hours of presence, and the sense of independence still amazes me.'),
  ('a1700000-0000-4000-8000-000000000013', 'ru', 'Алина · демо-история', 'Наш маленький чат рос, а я выгорала, пытаясь держать все на себе. Я сформулировала общую тему, ввела регулярные встречи и передала часть организации участникам. Теперь это живое сообщество, где я тоже получаю поддержку, идеи и новые возможности, а не только бесконечно отдаю силы.'),
  ('a1700000-0000-4000-8000-000000000013', 'en', 'Alina · demo story', 'Our small chat kept growing while I burned out trying to hold everything myself. I clarified our shared theme, introduced regular sessions, and passed part of the coordination to members. It is now a living community where I receive support, ideas, and opportunities instead of only giving away my energy.'),
  ('a1700000-0000-4000-8000-000000000014', 'ru', 'Тимур · демо-история', 'Бесконечные срочные задачи не оставляли мне времени по-настоящему думать. Я выбрал узкую тему, начал публиковать наблюдения и перевел проекты в более длинные циклы. Теперь могу глубоко работать, выбирать клиентов и снова чувствую себя исследователем, а не человеком, который только тушит пожары.'),
  ('a1700000-0000-4000-8000-000000000014', 'en', 'Timur · demo story', 'Endless urgent tasks left me no time to truly think. I chose a narrow subject, began publishing observations, and moved projects into longer cycles. Now I can work deeply, choose clients, and feel like a researcher again instead of someone who only puts out fires.'),
  ('a1700000-0000-4000-8000-000000000015', 'ru', 'Егор · демо-история', 'Я любил ремесло, но жизнь от срочного заказа до следующего почти уничтожила эту любовь. Убрал непредсказуемые позиции, сделал каталог, научился считать сроки и перестал отвечать по выходным. Теперь дело обеспечивает меня, но не забирает целиком, и я снова горжусь тем, что создаю.'),
  ('a1700000-0000-4000-8000-000000000015', 'en', 'Egor · demo story', 'I loved my craft, but living from one urgent order to the next almost destroyed that love. I removed unpredictable items, made a catalog, learned to estimate time, and stopped answering messages on weekends. The work supports me without consuming me, and I am proud of what I make again.'),
  ('a1700000-0000-4000-8000-000000000016', 'ru', 'Светлана · демо-история', 'После долгой паузы мне казалось, что я безнадежно отстала и никому не нужна. Я честно выписала свои навыки, обновила главное и начала с коротких проектов в удобном графике. Теперь пауза больше не выглядит дырой в биографии — это часть моей истории, после которой я вернулась сильнее и на своих условиях.'),
  ('a1700000-0000-4000-8000-000000000016', 'en', 'Svetlana · demo story', 'After a long break, I felt hopelessly behind and unwanted. I made an honest skills map, refreshed what mattered, and started with short projects on a schedule that fit my life. The pause no longer looks like a hole in my story; it is the part after which I returned stronger and on my own terms.'),
  ('a1700000-0000-4000-8000-000000000017', 'ru', 'Кирилл · демо-история', 'Я долго искал одну идеальную профессию и боялся ошибиться с выбором. В конце концов оставил стабильную работу по сильному навыку и рядом начал развивать небольшой продукт. Две опоры дали мне спокойствие: я могу экспериментировать, менять направление и не ставить все благополучие на одну карту.'),
  ('a1700000-0000-4000-8000-000000000017', 'en', 'Kirill · demo story', 'I spent years searching for one perfect profession and feared choosing wrong. Eventually, I kept stable work built on my strongest skill and began growing a small product beside it. Two supports gave me peace: I can experiment, change direction, and avoid placing all of my wellbeing on one bet.'),
  ('a1700000-0000-4000-8000-000000000018', 'ru', 'Катя · демо-история', 'Я считала занятые часы доказательством успеха, пока организм не заставил остановиться. Сократила лишние созвоны, оставила задачи, которые дают энергию, и начала планировать отдых так же серьезно, как работу. Сейчас мое дело растет вместе с качеством жизни, и мне больше не приходится платить здоровьем за чувство собственной ценности.'),
  ('a1700000-0000-4000-8000-000000000018', 'en', 'Katya · demo story', 'I treated busy hours as proof of success until my body forced me to stop. I cut unnecessary calls, kept the work that gives me energy, and began planning rest as seriously as work. My business now grows alongside my quality of life, and I no longer pay with my health for a sense of worth.'),
  ('a1700000-0000-4000-8000-000000000019', 'ru', 'Мила · демо-история', 'Я годами откладывала путешествия до мифического длинного отпуска. Перевела процессы в удаленный формат, заранее планирую тихие рабочие дни и больше не пытаюсь быть продуктивной каждую минуту поездки. Теперь выбираю следующий город из любопытства, а не для побега, и чувствую, что моя настоящая жизнь уже началась.'),
  ('a1700000-0000-4000-8000-000000000019', 'en', 'Mila · demo story', 'For years, I postponed travel until a mythical long vacation. I moved my processes online, plan quiet workdays in advance, and stopped trying to be productive every minute of a trip. Now I choose the next city out of curiosity rather than escape, and I feel that my real life has already begun.'),
  ('a1700000-0000-4000-8000-000000000020', 'ru', 'Артем · демо-история', 'Я устал снова и снова объяснять клиентам одно и то же и начинать каждый проект с нуля. Выбрал одну понятную проблему, собрал небольшое решение и проверил его на первых пользователях. У продукта появилась собственная жизнь, а у меня — время улучшать его, учиться и думать о будущем, а не только закрывать текущие часы.'),
  ('a1700000-0000-4000-8000-000000000020', 'en', 'Artem · demo story', 'I was tired of explaining the same thing to clients and starting every project from zero. I chose one clear problem, built a small solution, and tested it with early users. The product gained a life of its own, and I gained time to improve it, learn, and think beyond the hours in front of me.'),
  ('a1700000-0000-4000-8000-000000000021', 'ru', 'Вера · демо-история', 'Хаотичные заказы в семейном деле держали меня в постоянном напряжении. Я описала процессы, сделала цифровой каталог и ввела день без операционных задач. Теперь я не переживаю каждый вечер, как обеспечить семью: доход стал устойчивее, мне нравится развивать свое направление и не зависеть от работодателя.'),
  ('a1700000-0000-4000-8000-000000000021', 'en', 'Vera · demo story', 'Chaotic orders in our family business kept me under constant pressure. I documented the processes, built a digital catalog, and introduced a day without operations. I no longer spend every evening worrying about supporting my family: income is steadier, I enjoy growing my own direction, and I do not depend on an employer.'),
  ('a1700000-0000-4000-8000-000000000022', 'ru', 'Юрий · демо-история', 'Я много лет говорил себе, что начинать творческий путь уже поздно. Потом выбрал регулярность вместо грандиозного старта и начал публиковать маленькие работы рядом с основной занятостью. Сейчас у меня есть портфолио, первые заказы и главное — ощущение, что мечта больше не ждет разрешения и растет в моем темпе.'),
  ('a1700000-0000-4000-8000-000000000022', 'en', 'Yuri · demo story', 'For years, I told myself it was too late to begin a creative path. Then I chose consistency over a grand launch and started publishing small works beside my main job. I now have a portfolio, early commissions, and most importantly the feeling that my dream no longer waits for permission and can grow at my pace.'),
  ('a1700000-0000-4000-8000-000000000023', 'ru', 'Наташа · демо-история', 'Дом мечты годами существовал только в моей голове и казался слишком большим желанием. Я описала конкретный результат, разбила путь на небольшие шаги и каждую неделю отмечаю прогресс. До цели еще есть дорога, но я больше не чувствую бессилия: эта мечта уже стала частью моей сегодняшней жизни.'),
  ('a1700000-0000-4000-8000-000000000023', 'en', 'Natasha · demo story', 'My dream home lived only in my head for years and felt too large to touch. I defined the result, split the path into small steps, and review progress every week. There is still a road ahead, but I no longer feel powerless: the dream is already part of the life I live today.')
on conflict (post_id, locale) do update
set
  author_name = excluded.author_name,
  body = excluded.body;

insert into public.feed_post_media (
  post_id,
  media_type,
  media_url,
  alt_text,
  source_url,
  source_label,
  sort_order
)
values
  ('a1700000-0000-4000-8000-000000000001', 'image', 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=82', '{"ru":"Рабочее место фрилансера у окна","en":"A freelancer workspace by a window"}'::jsonb, 'https://unsplash.com/s/photos/freelance-work', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000002', 'image', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=82', '{"ru":"Ноутбук для удаленной работы","en":"A laptop used for remote work"}'::jsonb, 'https://unsplash.com/s/photos/remote-work', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000003', 'image', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=82', '{"ru":"Совместная творческая работа","en":"Creative work together"}'::jsonb, 'https://unsplash.com/s/photos/ux-design', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000004', 'image', 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=82', '{"ru":"Спокойный рабочий момент дома","en":"A calm work moment at home"}'::jsonb, 'https://unsplash.com/s/photos/work-from-home', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000005', 'image', 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=82', '{"ru":"Преподаватель во время занятия","en":"A teacher during a lesson"}'::jsonb, 'https://unsplash.com/s/photos/teacher', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000006', 'image', 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1200&q=82', '{"ru":"Инструменты творческой мастерской","en":"Tools in a creative workshop"}'::jsonb, 'https://unsplash.com/s/photos/craft-workshop', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000007', 'image', 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=82', '{"ru":"Удаленная команда за работой","en":"A remote team at work"}'::jsonb, 'https://unsplash.com/s/photos/remote-team', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000008', 'image', 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=82', '{"ru":"Владелица небольшого сервиса","en":"A small service business owner"}'::jsonb, 'https://unsplash.com/s/photos/small-business', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000009', 'image', 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=82', '{"ru":"Занятие в международной группе","en":"A lesson in an international group"}'::jsonb, 'https://unsplash.com/s/photos/language-learning', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000010', 'image', 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=82', '{"ru":"Работа над новым карьерным планом","en":"Working on a new career plan"}'::jsonb, 'https://unsplash.com/s/photos/career-change', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000011', 'image', 'https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=1200&q=82', '{"ru":"Фотограф с камерой на прогулке","en":"A photographer walking with a camera"}'::jsonb, 'https://unsplash.com/s/photos/photographer', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000012', 'image', 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=82', '{"ru":"Консультация команды у доски","en":"A team consultation at a board"}'::jsonb, 'https://unsplash.com/s/photos/consulting', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000013', 'image', 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1200&q=82', '{"ru":"Встреча небольшого сообщества","en":"A small community meeting"}'::jsonb, 'https://unsplash.com/s/photos/community-meeting', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000014', 'image', 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1200&q=82', '{"ru":"Исследовательские заметки и ноутбук","en":"Research notes and a laptop"}'::jsonb, 'https://unsplash.com/s/photos/research-work', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000015', 'image', 'https://images.unsplash.com/photo-1459908676235-d5f02a50184b?auto=format&fit=crop&w=1200&q=82', '{"ru":"Работа мастера в студии","en":"A craftsperson working in a studio"}'::jsonb, 'https://unsplash.com/s/photos/craftsman', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000016', 'image', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=82', '{"ru":"Уверенное возвращение к работе","en":"A confident return to work"}'::jsonb, 'https://unsplash.com/s/photos/confident-woman', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000017', 'image', 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=82', '{"ru":"Планирование нескольких направлений","en":"Planning multiple work directions"}'::jsonb, 'https://unsplash.com/s/photos/business-planning', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000018', 'image', 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=82', '{"ru":"Спокойный отдых на природе","en":"A calm moment of rest outdoors"}'::jsonb, 'https://unsplash.com/s/photos/wellbeing', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000019', 'image', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=82', '{"ru":"Путешествие и работа из нового места","en":"Travel and work from a new place"}'::jsonb, 'https://unsplash.com/s/photos/digital-nomad', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000020', 'image', 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=82', '{"ru":"Обсуждение первого продукта","en":"Discussing a first product"}'::jsonb, 'https://unsplash.com/s/photos/product-launch', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000021', 'image', 'https://images.unsplash.com/photo-1521791055366-0d553872125f?auto=format&fit=crop&w=1200&q=82', '{"ru":"Партнерство в семейном деле","en":"Partnership in a family business"}'::jsonb, 'https://unsplash.com/s/photos/family-business', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000022', 'image', 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&q=82', '{"ru":"Творческая работа за большим столом","en":"Creative work at a large table"}'::jsonb, 'https://unsplash.com/s/photos/creative-work', 'Unsplash', 0),
  ('a1700000-0000-4000-8000-000000000023', 'image', 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1200&q=82', '{"ru":"Дом, ставший понятной целью","en":"A home that became a clear goal"}'::jsonb, 'https://unsplash.com/s/photos/dream-home', 'Unsplash', 0)
on conflict (post_id, sort_order) do update
set
  media_type = excluded.media_type,
  media_url = excluded.media_url,
  alt_text = excluded.alt_text,
  source_url = excluded.source_url,
  source_label = excluded.source_label;
