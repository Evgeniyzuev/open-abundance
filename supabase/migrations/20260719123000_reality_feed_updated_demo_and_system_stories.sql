alter table public.feed_posts
drop constraint if exists feed_posts_post_type_check;

alter table public.feed_posts
add constraint feed_posts_post_type_check
check (post_type in ('daily_progress', 'manual', 'external_link', 'wish', 'reality_demo', 'system_story'));

create table if not exists public.feed_system_accounts (
  account_key text primary key,
  display_name text not null,
  bio jsonb not null default '{}'::jsonb,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feed_system_story_metadata (
  post_id uuid primary key references public.feed_posts(id) on delete cascade,
  system_account_key text not null references public.feed_system_accounts(account_key) on delete restrict,
  series_key text not null,
  series_order integer not null check (series_order > 0),
  story_kind text not null check (story_kind in ('observation', 'interpretation', 'principle', 'mechanism', 'invitation', 'mixed')),
  evidence_status text not null check (evidence_status in ('editorial', 'source_required', 'verified_source')),
  next_story_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (system_account_key, series_key, series_order)
);

create index if not exists feed_system_story_metadata_series_idx
on public.feed_system_story_metadata (system_account_key, series_key, series_order);

alter table public.feed_system_accounts enable row level security;
alter table public.feed_system_story_metadata enable row level security;

grant select on table public.feed_system_accounts to authenticated;
grant select on table public.feed_system_story_metadata to authenticated;
grant select, insert, update, delete on table public.feed_system_accounts to service_role;
grant select, insert, update, delete on table public.feed_system_story_metadata to service_role;

drop policy if exists "Authenticated users can read active system accounts" on public.feed_system_accounts;
create policy "Authenticated users can read active system accounts"
on public.feed_system_accounts
for select
to authenticated
using (is_active);

drop policy if exists "Authenticated users can read visible system stories" on public.feed_system_story_metadata;
create policy "Authenticated users can read visible system stories"
on public.feed_system_story_metadata
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_system_story_metadata.post_id
      and post.status = 'published'
      and post.visibility = 'public'
      and post.deleted_at is null
  )
);

drop trigger if exists touch_feed_system_accounts_updated_at on public.feed_system_accounts;
create trigger touch_feed_system_accounts_updated_at
before update on public.feed_system_accounts
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_feed_system_story_metadata_updated_at on public.feed_system_story_metadata;
create trigger touch_feed_system_story_metadata_updated_at
before update on public.feed_system_story_metadata
for each row
execute function public.touch_updated_at();

insert into public.feed_system_accounts (account_key, display_name, bio, avatar_url, is_active)
values (
  'abundance_system',
  'Abundance System',
  '{"ru":"Объясняем, зачем создан Abundance и как он устроен","en":"Why Abundance exists and how the system works"}'::jsonb,
  '/icons/icon2.svg',
  true
)
on conflict (account_key) do update
set
  display_name = excluded.display_name,
  bio = excluded.bio,
  avatar_url = excluded.avatar_url,
  is_active = excluded.is_active;

create temporary table reality_feed_demo_updates (
  source_key text primary key,
  author_ru text not null,
  author_en text not null,
  body_ru text not null,
  body_en text not null
) on commit drop;

insert into reality_feed_demo_updates (source_key, author_ru, author_en, body_ru, body_en)
values
(
  'reality_demo:from-burnout-to-freelance',
  'Ирина · демо-история',
  'Irina · demo story',
  $demo_ru$Я уже не помню, когда в последний раз просыпалась без тяжести в груди. Работа вроде бы была нормальной, зарплата приходила, но каждый понедельник ощущался как маленькая катастрофа. Я смотрела на календарь и думала: «Неужели так будет всегда?»

Однажды бывшая коллега прислала мне ссылку на Abundance. Она сказала: «Просто посмотри, может, тебе подойдет». Я почти не открыла сообщение. Мне казалось, что очередной проект ничего не изменит, но в тот вечер мне было так тесно в собственной жизни, что я решила попробовать хотя бы из любопытства.

Сначала я просто записала в Goals, какую работу хотела бы делать и какое время оставить себе. Потом начала выполнять маленькие действия в Today. Это не было похоже на большой рывок. Скорее, я впервые за долгое время перестала ждать спасения и начала замечать, что могу сделать сегодня.

Через несколько недель я взяла небольшой freelance-заказ по навыку, который уже давно считала несерьезным. Потом собрала портфолио, научилась говорить о своих условиях и оставила в расписании нормальное место для отдыха. В какой-то момент я поймала себя на мысли: я больше не просто терплю свою жизнь — я действительно могу ее менять.

Сейчас я работаю блоками, сама выбираю ритм и планирую поездки без чувства вины. Все не стало идеальным, но стало удивительно просто: у меня есть следующий шаг, понятное направление и ощущение, что моя жизнь снова принадлежит мне.

Иногда думаю, жаль, что мне не рассказали об Abundance раньше. Если вы тоже сейчас чувствуете, что застряли, не обязательно сразу принимать большие решения. Можно просто посмотреть, выбрать желание, поставить примерную цель и сделать один небольшой шаг. Дальше станет понятнее, подходит вам это или нет.$demo_ru$,
  $demo_en$I could not remember the last time I woke up without a weight in my chest. The job looked fine from the outside, but every Monday felt like a small disaster.

A former colleague sent me a link to Abundance and said, “Just have a look.” I nearly ignored it. That evening I felt so cramped inside my own life that I opened it out of curiosity.

I wrote down the kind of work and daily rhythm I wanted in Goals, then started taking small actions in Today. A few weeks later I accepted a small freelance project using a skill I had never taken seriously. I built a portfolio, learned to state my terms, and protected time for rest.

Nothing became perfect overnight. What changed was simpler: I stopped only enduring my life and saw that I could alter it one decision at a time. I now work in focused blocks and plan trips without guilt.

I wish someone had shown me Abundance earlier. If you feel stuck, you do not have to make a dramatic decision. Choose one wish, set a rough goal, and try one small step. Then decide whether this path fits you.$demo_en$
),
(
  'reality_demo:careful-career-exit',
  'Павел · демо-история',
  'Pavel · demo story',
  $demo_ru$Я много месяцев говорил, что уволюсь, но каждое утро снова открывал тот же ноутбук. Мне не нравилась работа, не нравился мой ритм и не нравилось, каким раздраженным я становился дома. При этом мысль об уходе пугала еще сильнее: у меня была семья, обязательства и никакой уверенности, что дальше будет лучше.

Как-то вечером мы с приятелем снова заговорили об этом. Он показал мне Abundance и сказал, что сам использует его, чтобы не держать большие перемены только в голове. Я отнесся скептически. Решил посмотреть из любопытства, без обещаний себе «начать новую жизнь с понедельника».

Я записал в Goals, от чего именно хочу уйти и к чему хочу прийти. В Today начал с самых земных шагов: разобрать навыки, выбрать одно направление, проверить его на маленькой задаче, выделить время для обучения. Через Abundance я впервые увидел не красивую мечту, а последовательность, которую можно выдержать.

Я не бросил работу сразу. Сначала сделал небольшой проект, потом еще один, собрал запас и понял, какой график мне подходит. Несколько месяцев спустя я назначил дату перехода и в этот раз не сбежал от усталости — я принимал решение, к которому постепенно подготовился.

Теперь я работаю меньше хаотичными рывками и больше — в своем ритме. У меня все еще бывают сложные дни, но я больше не чувствую себя запертым. Самое важное изменение произошло не в день увольнения, а раньше: я понял, что могу строить следующий этап сам.

Не знаю, подойдет ли вам такой путь. Мне самому сначала нужно было просто понять, какие варианты вообще есть. Решать, пробовать или нет, каждый будет сам — но сначала неплохо увидеть, из чего выбирать.$demo_ru$,
  $demo_en$For months I said I would quit, yet every morning I opened the same laptop. I disliked the job and the person I became after work, but leaving felt even more frightening because I had a family and obligations.

A friend showed me Abundance. I opened it skeptically, without promising to start a new life on Monday. In Goals I wrote what I wanted to leave and what I wanted to move toward. Today turned that into ordinary steps: review my skills, choose one direction, test it on a small task, and make time to learn.

I did not quit at once. I completed one project, then another, built a financial buffer, and discovered a rhythm I could sustain. Months later I chose a transition date. I was no longer escaping from exhaustion; I was making a decision I had prepared for.

The biggest change happened before I left: I understood that I could build the next stage myself. I do not know if this route suits everyone. First see which options exist, then decide whether you want to try.$demo_en$
),
(
  'reality_demo:parent-flexible-income',
  'Ольга · демо-история',
  'Olga · demo story',
  $demo_ru$Я долго жила с ощущением, что в любом случае кого-то подведу. Если работала — чувствовала вину перед семьей. Если занималась домом — злилась на себя за то, что снова отложила свои планы. Я даже перестала говорить о собственных желаниях, потому что они казались чем-то несвоевременным.

Сестра однажды выслушала меня и посоветовала посмотреть Abundance. Я ожидала увидеть очередной список советов, но открыла приложение просто потому, что больше не знала, что попробовать. Сначала мне было интересно проверить, получится ли вообще сформулировать свою цель в одном абзаце.

Я записала ее в Goals, а затем стала отмечать в Today совсем маленькие действия. Убрать услугу, которая забирала слишком много сил. Оставить короткое рабочее окно утром. Заранее сказать клиенту, когда я на связи. Это выглядело почти несерьезно, но постепенно день перестал разваливаться на случайные куски.

Через некоторое время я собрала понятный формат работы, который помещается в мою семью. Я больше не пытаюсь доказать, что могу успеть все. Я знаю, что могу двигаться маленькими шагами, возвращаться к цели и не бросать себя после сложной недели.

Теперь у меня есть свое дело, время для близких и немного пространства, которое принадлежит только мне. Я не стала другим человеком и не получила идеальную жизнь. Просто стало легче дышать: я больше не выбираю между семьей и собой каждый день.

Радуюсь, что сестра тогда подсказала мне про Abundance. Если бы я увидела это раньше, наверное, не стала бы так долго откладывать свои желания. Иногда достаточно просто поиграться, выбрать то, что откликается, поставить примерную цель и посмотреть, что получится.$demo_ru$,
  $demo_en$I used to feel that I would disappoint someone whatever I chose. When I worked, I felt guilty about my family. When I focused on home, I was angry at myself for postponing my own plans again.

My sister suggested Abundance. I expected another list of advice, but I opened it because I had run out of ideas. I wrote one goal, then marked very small actions in Today: remove a service that drained me, keep a short morning work window, and tell clients when I was available.

The steps looked almost too small to matter, but my days gradually stopped falling into random pieces. I built a work format that fits inside family life instead of fighting it. I no longer try to prove that I can do everything.

I now have my own work, time with the people I love, and a little space that belongs only to me. Life is not perfect; it is simply easier to breathe. Sometimes it is enough to explore, choose a wish that feels real, set a rough goal, and see what one small step changes.$demo_en$
),
(
  'reality_demo:developer-location-freedom',
  'Денис · демо-история',
  'Denis · demo story',
  $demo_ru$Я привык считать нормой то, что каждый день трачу часы на дорогу, а отпуск планирую вокруг разрешений и чужого графика. Вроде бы у меня была хорошая профессия, но я все чаще чувствовал, что сам стал приложением к офису. Особенно тяжело было признавать: я не понимал, как выбраться, не разрушив все сразу.

Однажды я случайно наткнулся на Abundance, когда читал обсуждение о работе и личных целях. Я открыл его без особых ожиданий — скорее хотел понять, что люди вообще называют изменением жизни. Первое, что зацепило, — не обещания свободы, а предложение начать с одного честного вопроса: как я хочу проводить обычный день?

Я записал ответ в Goals и начал с маленьких шагов в Today. Разобрал, какие задачи действительно требуют офиса, научился фиксировать результат вместо часов присутствия, предложил команде асинхронный формат. Сначала это было просто экспериментом на любопытство. Потом я заметил, что у меня впервые появились варианты.

Через несколько месяцев я уже мог работать удаленно часть недели, а затем полностью перестроил формат проектов. Я не стал бесконечно путешествующим героем из рекламы. Я просто получил возможность иногда жить в другом городе, приезжать к близким и выбирать место не из страха, а из желания.

Сейчас мой ноутбук — инструмент, а не повод быть привязанным к одному месту. Жизнь стала спокойнее, потому что свобода оказалась не мечтой на потом, а набором решений, которые можно принимать постепенно.

Я рад, что тогда не пролистал Abundance. Не пришлось сразу увольняться, уезжать или полностью менять жизнь. Можно начать с любопытства и одного вопроса: а какой выбор у меня вообще есть?$demo_ru$,
  $demo_en$I used to treat hours of commuting and planning holidays around someone else’s permission as normal. I had a good profession, yet often felt like an accessory to the office.

I found Abundance while reading a discussion about work and personal goals. What caught me was not a promise of freedom, but one honest question: what do I want an ordinary day to look like?

I wrote the answer in Goals and tested small changes through Today. I separated tasks that truly required the office, documented results instead of hours, and suggested asynchronous work to my team. At first it was only an experiment. Then I noticed that I had options.

Within several months I could work remotely part of the week and later reshaped my projects completely. I did not become a permanent digital nomad. I simply gained the ability to stay in another city, visit family, and choose where to live without fear.

You do not have to quit or move immediately. Start with curiosity and one question: what choices do I actually have?$demo_en$
),
(
  'reality_demo:family-business-modernized',
  'Вера · демо-история',
  'Vera · demo story',
  $demo_ru$Я выросла рядом с семейным делом и всегда думала, что однажды просто продолжу его. Но в последние годы оно стало похоже на бесконечное тушение пожаров: заказы приходили хаотично, все держалось на родителях, а я каждый вечер переживала, хватит ли сил и денег на следующий месяц. Мне хотелось помочь, но я не видела, с чего начать.

Соседка как-то пригласила меня на небольшую встречу и показала Abundance. Я сначала решила, что это не для меня: у меня не было времени на большие планы и веры в красивую новую жизнь тоже не было. Но мне стало любопытно, можно ли хотя бы разложить этот хаос на понятные шаги.

Я записала в Goals, каким хочу видеть семейное дело через год, а в Today начала с одного процесса за раз. Описала роли, собрала вопросы клиентов, сделала первый простой каталог и ввела правило не брать заказы в последний момент. Каждый шаг казался слишком маленьким, чтобы что-то изменить, но вместе они начали возвращать нам контроль.

Через некоторое время у меня появилось собственное направление внутри семейного дела. Я отвечаю за онлайн-часть, развиваю ее и понимаю, зачем просыпаюсь утром. Самое неожиданное — я перестала переживать каждый вечер, как обеспечить семью. Не потому, что исчезли все трудности, а потому, что теперь у нас есть система и следующий шаг.

Сейчас мне нравится развивать свое дело и видеть результат своих решений. Я больше не чувствую себя человеком, который просто подхватил чужую работу. Я создаю свою часть жизни — спокойно, постепенно и рядом с теми, кто мне дорог.

Хотелось бы, чтобы мне показали Abundance раньше. Я не могу сказать, что он решит чужие проблемы, но посмотреть и попробовать маленький шаг точно можно. Иногда важное начинается не с готового плана, а с понимания, что выбор вообще существует.$demo_ru$,
  $demo_en$I grew up around our family business and assumed I would simply continue it. In recent years it turned into constant firefighting: chaotic orders, exhausted parents, and a new worry every evening about the next month.

A neighbor invited me to a small meeting and showed me Abundance. I had no time for grand plans, but I was curious whether the chaos could be divided into understandable steps.

In Goals I described what I wanted the business to look like in a year. In Today I worked on one process at a time: define roles, collect customer questions, create a simple catalog, and stop accepting last-minute orders. Each step felt too small, but together they returned a sense of control.

I now lead the online side of the family business and can see the result of my decisions. Difficulties did not disappear; we gained a system and a next step. I wish I had seen this earlier. Abundance cannot promise to solve someone else’s problems, but anyone can look around and test one small action.$demo_en$
),
(
  'reality_demo:small-town-remote-career',
  'Максим · демо-история',
  'Maxim · demo story',
  $demo_ru$В нашем городе обычно два варианта: идти на местное предприятие или уезжать. Третьего как будто нет. Я несколько лет смотрел вакансии, закрывал их через минуту и думал, что, наверное, просто не там ищу. Переезжать не хотелось — здесь родители, друзья, привычная жизнь. Но и оставаться в ощущении, что все уже решено за меня, тоже надоело.

Однажды коллега скинул в чат ссылку на Abundance. Без объяснений: «Макс, посмотри, может пригодится». Я сначала даже не открыл. Потом стало интересно, что там такого, и зашел на пару минут.

Сначала ничего глобального не планировал. Взял первую задачу и сразу сделал. Тут же увидел результат. Сумма была крохотная — но дело вообще было не в ней. Важно, что действие заняло минуту и сразу дало понятный отклик.
В обычной работе и учебе результат часто отложен куда-то в будущее, причем не всегда понятно, будет ли он вообще. А тут я подумал: «Интересно, а можно повторить?» Оказалось — можно. Начал разбираться, что еще можно делать прямо сегодня и как увеличивать доход. Не все получилось с первого раза, пару раз казалось, что я застрял, и вообще хотелось бросить. Но, сравнивая со всем, что у меня было до этого, я понял, что именно в таком формате готов делать больше.
И я оказался не один. На многие вопросы уже были ответы, Abundance AI всегда помогал разобраться, а люди, которые прошли этот путь раньше, готовы делиться своим опытом. Постепенно стало понятно: здесь не обещают, что все получится само. Но если делать шаги, помощь и следующий шаг действительно находятся.

И в какой-то момент до меня дошло: дело не в том, что в моем городе нет возможностей. Я просто раньше видел только два пути — терпеть или уезжать. Через несколько месяцев у меня уже был нормальный удаленный формат и более спокойный рабочий день.

Сейчас я по-прежнему живу здесь, но смотрю на это иначе. Раньше казалось, что я застрял. Теперь понимаю: я остаюсь здесь не потому, что у меня нет вариантов, а потому что мне так удобно. Сейчас я вижу перспективы не только в голове — цифры тоже подтверждают, что мои реальные возможности растут. За это время успел побывать в двух странах, которые давно хотел увидеть.
В основном я все еще работаю из дома, но теперь знаю, что могу работать и зарабатывать из любого места. Для меня Abundance начался просто с любопытства. А потом я понял: не обязательно сразу переворачивать всю жизнь, чтобы быть на своем месте.

Если вам знакомо ощущение, что в вашем городе или профессии уже все решено, можно хотя бы посмотреть, какие еще варианты бывают. Не обязательно сразу уезжать или строить большой план. Иногда один небольшой эксперимент уже показывает, куда двигаться дальше.$demo_ru$,
  $demo_en$In my town it seemed there were only two options: work at the local plant or leave. I did not want to move away from family and friends, but I was tired of feeling that my future had already been decided.

A colleague dropped an Abundance link into our work chat. I opened it for a few minutes out of curiosity, took the first tiny task, and immediately saw a result. The amount was small; what mattered was the feeling that an action produced a clear response instead of a vague promise about the future.

I began exploring what else I could do today and how my income might grow. Some attempts failed and I nearly stopped. Abundance AI helped with questions, and people who had already taken similar steps shared what they knew. Nobody promised that it would happen by itself.

Months later I had a stable remote format and a calmer workday. I still live in the same town, now by choice. I have also visited two countries I had wanted to see for years. Abundance began as curiosity and showed me that I did not have to turn my whole life upside down to discover another path.$demo_en$
),
(
  'reality_demo:designer-second-career',
  'Лена · демо-история',
  'Lena · demo story',
  $demo_ru$После нескольких лет в координации проектов мне очень хотелось начать заново. Только непонятно было как. Вакансии UX-дизайнера я открывала с интересом, а закрывала с мыслью: «Ну куда мне с моим опытом?» Казалось, что я слишком поздно спохватилась и все лучшие годы потратила не туда.

Бывшая руководительница во время разговора о смене профессии сказала мне про Abundance. Не в духе «там ты точно найдешь себя», а просто: «Попробуй применить то, что уже умеешь. Иногда это быстрее, чем начинать с нуля». Я зашла больше для очистки совести, ни на что особо не рассчитывая. Просто проверить.

В Goals записала, что именно меня привлекает в дизайне. Потом стала делать маленькие задания: разобрать интерфейс, проконсультировать по вопросам, собрать один учебный кейс. Сначала я ужасно стеснялась показывать эти работы. Казалось, все сразу увидят, что я новичок в дизайне.

Через время заметила, что мой прошлый опыт постоянно помогает. Я умею задавать вопросы, видеть, где люди теряются, и доводить задачу до результата. Сделала несколько кейсов, взяла первые небольшие задачи и постепенно перестала воспринимать прежнюю карьеру как ошибку.

Теперь я еще не называю свою жизнь идеальной, но работа стала намного ближе к тому, что мне интересно. И да, теперь я знаю что каждый может сменить направление. Не одним красивым решением, а обычными шагами, которые сначала кажутся слишком маленькими.

Мне самой хотелось бы узнать об Abundance раньше. Если тоже кажется, что прошлый опыт только мешает, можно не верить на слово — просто выбрать одну интересную задачу и проверить. По результату станет понятнее, есть ли в этом что-то для вас.$demo_ru$,
  $demo_en$After several years coordinating projects, I wanted to start over as a UX designer. Every vacancy interested me, but I closed it thinking that I was too late and had spent my best years in the wrong field.

A former manager mentioned Abundance and suggested that I apply what I already knew instead of erasing it. I opened the app mostly to prove to myself that I had tried.

I wrote down what attracted me to design, then took small tasks: analyze an interface, ask users questions, and build one practice case. I was embarrassed to show the early work. Over time I noticed that my previous experience was useful everywhere. I knew how to ask questions, see where people got lost, and bring work to a result.

Several cases and small paid tasks later, I stopped treating my old career as a mistake. My work is now much closer to what interests me. A change of direction did not come from one beautiful decision, but from ordinary steps that initially looked too small. If your past seems like a burden, test it on one interesting task before throwing it away.$demo_en$
),
(
  'reality_demo:teacher-independent-practice',
  'Аня · демо-история',
  'Anya · demo story',
  $demo_ru$Больше всего я устала не от детей и даже не от уроков. Устала от расписания, отчетов и того, что за один пропущенный час весь день рассыпается. Приходила домой и уже не могла нормально ни подготовиться, ни поговорить с близкими. А уйти из школы страшно: я ведь не знала, что делать дальше.

Как-то после занятия мама одного ученика спросила, почему я не веду занятия самостоятельно. Я посмеялась, а она потом прислала мне Abundance. Сказала, что там можно начать с простого плана, без обязательства сразу становиться предпринимателем. Вот это мне и подошло — не надо было изображать человека, у которого все готово.

Сначала попробовала собрать одну понятную программу и взять пару учеников сверх школы. В Today отмечала не «создать большую практику», а вполне обычные вещи: дописать материал, назначить разговор, проверить расписание. Несколько раз отменяла собственные планы, потому что уставала. Потом возвращалась.

Через пару месяцев стало видно, какие занятия мне нравятся, а какие только забирают силы. Я добавила онлайн-группу, оставила меньше часов и перестала хвататься за все подряд. Сначала было непривычно самой отвечать за расписание, но сейчас в этом больше свободы, чем страха.

Я все еще преподаю, просто теперь это не бесконечная школьная гонка. У меня появились свои ученики, свой формат и время на учебу. А началось все с того, что я открыла Abundance, потому что одна мама сказала: «Попробуйте, вдруг получится».

Если вы тоже не понимаете, что делать после нелюбимой работы, не обязательно сразу уходить. Можно сначала выбрать желание, поставить примерную цель и попробовать один маленький формат. Иногда этого хватает, чтобы понять, есть ли следующий шаг.$demo_ru$,
  $demo_en$It was not the children or the lessons that exhausted me. It was the timetable, reports, and the way one missed hour could destroy the whole day. Leaving school felt frightening because I had no idea what came next.

After a lesson, a student’s mother asked why I did not teach independently and later sent me Abundance. She said I could begin with a simple plan without pretending to be an entrepreneur who already had everything figured out.

I created one clear program and worked with a few students outside school. In Today I did not write “build a large practice.” I wrote ordinary actions: finish one lesson, arrange one conversation, check the schedule. I abandoned my plan several times when I was tired, then returned.

Within a few months I knew which lessons gave me energy. I added an online group, reduced my hours, and stopped accepting everything. I still teach, but it no longer feels like an endless race. If you do not know what follows an unloved job, you do not have to leave immediately. Test one small format and see whether a next step appears.$demo_en$
),
(
  'reality_demo:maker-to-small-brand',
  'Саша · демо-история',
  'Sasha · demo story',
  $demo_ru$С мастерской все было странно. Сам процесс мне нравился, а заказы — нет. То тишина на две недели, то сразу пять срочных просьб, и я сижу ночами. После такого уже не хочется ничего делать. Несколько раз думал закрыть все и вернуться к обычной работе, хотя от одной этой мысли становилось еще хуже.

Друг позвал меня на встречу про Abundance. Я пошел скорее за компанию и почти сразу решил, что это не моя история. Потом кто-то спросил, чего я вообще хочу от своей работы, и я впервые нормально сформулировал ответ: делать меньше случайных вещей и собрать понятную линейку.

Дальше пошли довольно скучные шаги. Выбрать несколько изделий. Посчитать время. Показать людям не только готовый результат, но и процесс. Разобраться, сколько заказов я реально могу взять. Никакого вдохновляющего рывка не было. Просто в какой-то момент заказы перестали приезжать хаосом.

В Abundance я возвращался, когда снова хотелось все бросить. Смотрел, что уже сделано, выбирал следующий шаг и продолжал. Через несколько месяцев у меня появился небольшой бренд и нормальная очередь без ночных авралов.

Теперь мастерская приносит деньги, но не забирает всю жизнь. Иногда я все еще устаю и ворчу на заказы. Просто больше не думаю, что единственный способ сохранить любимое дело — работать до ночи.

Рад, что тогда пошел на ту встречу, хотя почти сразу решил, что это не мое. Если интересно, можно просто посмотреть, как устроен Abundance, и немного поиграться без больших ожиданий. Не подойдет — будет понятно. Подойдет — появится следующий шаг.$demo_ru$,
  $demo_en$I loved making things in my workshop but hated the order cycle: two silent weeks, then five urgent requests and nights without sleep. I considered closing it and returning to a regular job.

A friend invited me to an Abundance meeting. I went for company and quickly decided it was not for me. Then someone asked what I actually wanted from the work. My answer was simple: fewer random objects and one recognizable product line.

The next steps were boring in a useful way: choose several products, calculate the real time, show the process, and limit the number of orders. There was no inspiring leap. Orders simply stopped arriving as chaos.

I returned to Abundance whenever I wanted to give up, looked at what was already done, and chose the next step. A few months later I had a small brand and a manageable queue without night emergencies. The workshop now earns money without consuming my whole life. You can explore Abundance without large expectations: if it does not fit, you will know; if it does, a next step will appear.$demo_en$
),
(
  'reality_demo:local-service-online',
  'Мария · демо-история',
  'Maria · demo story',
  $demo_ru$У меня был хороший сервис и постоянное ощущение, что все держится на случайности. Сегодня звонят пять клиентов, завтра — никто. В пустые дни я не отдыхала, а нервничала. В загруженные — брала все подряд и потом жалела. Получался какой-то бесконечный режим «то густо, то пусто».

Я искала в интернете, как организовать запись и не сгореть, и случайно наткнулась на Abundance. Сначала открыла из-за одного совета, потом осталась посмотреть, что это вообще такое. Не было мысли строить новую жизнь. Хотелось хотя бы перестать каждый вечер проверять телефон.

Начала с простого: записала, какой результат клиент должен получать, и поставила в Today задачу описать услугу нормальными словами. Потом добавила предварительную запись, ограничила количество заказов и оставила один день без работы. Самым сложным оказалось не сделать систему, а не отменить ее при первом же наплыве клиентов.

Постепенно стало спокойнее. Клиенты понимали, когда я работаю, я понимала свою загрузку. Доход не превратился в сказку, зато исчезло постоянное ощущение, что все может развалиться завтра. Появилось время подумать, что еще я хочу сделать.

Сейчас у меня по-прежнему бывают пустые и тяжелые недели. Но пустой день больше не пугает. Я знаю, что могу посмотреть на план, выбрать следующий шаг и не бросаться спасать бизнес в панике. Наверное, именно это и изменилось сильнее всего после знакомства с Abundance.

Если вы тоже устали зависеть от случайности, можно начать не с попытки все исправить, а с одного желания и примерной цели. Просто посмотреть, что можно сделать сегодня. Дальше уже станет ясно, помогает ли вам такой подход.$demo_ru$,
  $demo_en$I had a good local service and the constant feeling that everything depended on chance. Five clients called one day and nobody the next. Quiet days made me anxious; busy days made me accept too much.

While searching for a better booking system, I found Abundance. I did not intend to build a new life. I only wanted to stop checking my phone every evening.

I defined the result a client should receive, then put one Today task into plain language. I added advance booking, limited the number of orders, and protected one day without work. The hardest part was not creating the system but keeping it when demand suddenly increased.

Clients gradually understood my schedule and I understood my capacity. Income did not become a fairy tale, but the fear that everything might collapse tomorrow became quieter. Empty and difficult weeks still happen, yet an empty day no longer frightens me.

If you are tired of depending on chance, do not start by fixing everything. Choose one wish, set a rough goal, and see what can be done today. Then decide whether this approach helps.$demo_en$
);

update public.feed_posts post
set
  author_label = updates.author_ru,
  body = updates.body_ru,
  updated_at = now(),
  deleted_at = null
from reality_feed_demo_updates updates
where post.source_key = updates.source_key
  and post.post_type = 'reality_demo';

insert into public.feed_post_translations (post_id, locale, author_name, body)
select post.id, localized.locale, localized.author_name, localized.body
from public.feed_posts post
join reality_feed_demo_updates updates on updates.source_key = post.source_key
cross join lateral (
  values
    ('ru'::text, updates.author_ru, updates.body_ru),
    ('en'::text, updates.author_en, updates.body_en)
) localized(locale, author_name, body)
on conflict (post_id, locale) do update
set
  author_name = excluded.author_name,
  body = excluded.body;

create temporary table reality_feed_system_stories (
  id uuid primary key,
  source_key text unique not null,
  series_order integer unique not null,
  story_kind text not null,
  evidence_status text not null,
  next_story_key text,
  body_ru text not null,
  body_en text not null,
  media_url text not null,
  alt_ru text not null,
  alt_en text not null,
  source_url text not null
) on commit drop;

insert into reality_feed_system_stories (
  id,
  source_key,
  series_order,
  story_kind,
  evidence_status,
  next_story_key,
  body_ru,
  body_en,
  media_url,
  alt_ru,
  alt_en,
  source_url
)
values
(
  'a1800000-0000-4000-8000-000000000001',
  'system_story:01-housing-and-productivity',
  1,
  'mixed',
  'source_required',
  'system_story:02-access-scarcity',
  $system_ru$Почему квартира стала дальше, хотя зарплата в цифрах больше родительской?

Многие молодые люди откладывают покупку жилья и создание семьи. Они работают, получают в цифрах больше родителей — а накопить даже на небольшую квартиру все равно кажется сложнее.

При этом общество не стало беднее. Мы быстрее строим, производим и обмениваемся знаниями. Технологии экономят тысячи часов труда. Но выгода от этого роста распределяется не автоматически: стоимость жилья и активов может расти быстрее доходов тех, кто ими не владеет.

Abundance начинается с неудобного вопроса: если общая способность создавать растет, почему обычному человеку не становится заметно легче строить свою жизнь? И кто получает основную долю этого роста?

Следующая глава — о том, почему дефицит может находиться не на складе, а в правилах доступа.$system_ru$,
  $system_en$Why does a home feel further away even when the salary number is higher than our parents’?

Many young people postpone buying a home and starting a family. They work and earn more in nominal terms, yet even a small apartment can feel harder to reach.

Society has not lost its productive power. We build, produce, and exchange knowledge faster, while technology saves thousands of hours of work. But the benefit does not spread automatically: housing and asset prices can rise faster than the income of people who do not own them.

Abundance starts with an uncomfortable question. If our shared ability to create keeps growing, why does building an ordinary life not become noticeably easier? Who receives the largest share of that growth?

The next chapter looks at scarcity that exists not in a warehouse, but in the rules of access.$system_en$,
  'https://images.unsplash.com/photo-1758523669429-45723b96106c?auto=format&fit=crop&w=1200&q=82',
  'Молодая пара обсуждает жилье с ноутбуком среди коробок',
  'A young couple discusses housing with a laptop among moving boxes',
  'https://unsplash.com/photos/couple-sitting-together-looking-at-tablet-SmAKlW9wN18'
),
(
  'a1800000-0000-4000-8000-000000000002',
  'system_story:02-access-scarcity',
  2,
  'interpretation',
  'source_required',
  'system_story:03-money-flows',
  $system_ru$Почему при полных магазинах приходится решать, что сегодня не покупать?

Полки заполнены едой. В городе стоят пустые квартиры и офисы. В интернете почти бесконечно много знаний. Но для многих людей дефицит никуда не исчез: он просто переместился с полки в кошелек.

Есть нехватка физическая — когда нужного действительно мало. А есть нехватка доступа — когда ресурс существует, но человек не может получить его из-за цены, правил, собственности или отсутствия нужных связей.

Abundance не утверждает, что ресурсы бесконечны. Идея проще: прежде чем производить еще больше, стоит научиться лучше видеть уже существующие возможности, соединять их с реальными потребностями и сокращать потери между ними.

Но почему доступ к базовым вещам так сильно зависит от ежемесячной зарплаты? Об этом — дальше.$system_ru$,
  $system_en$Why do full stores still force people to decide what they cannot buy today?

Shelves are full of food. Cities contain empty homes and offices. The internet holds almost limitless knowledge. Yet scarcity has not disappeared for many people; it has moved from the shelf into the wallet.

Some scarcity is physical: the needed resource is genuinely limited. Other scarcity is about access: the resource exists, but price, ownership, rules, or missing connections keep it out of reach.

Abundance does not claim that resources are infinite. The idea is simpler. Before producing even more, we should become better at seeing existing capacity, connecting it with real needs, and reducing the losses in between.

Why does access to basic things depend so heavily on a monthly wage? That is the next question.$system_en$,
  'https://images.unsplash.com/photo-1628102491629-778571d893a3?auto=format&fit=crop&w=1200&q=82',
  'Покупательница с тележкой выбирает продукты в полном магазине',
  'A shopper with a cart chooses groceries in a full store',
  'https://unsplash.com/s/photos/shopping-groceries'
),
(
  'a1800000-0000-4000-8000-000000000003',
  'system_story:03-money-flows',
  3,
  'interpretation',
  'source_required',
  'system_story:04-ai-and-work',
  $system_ru$Почему зарплата заканчивается раньше месяца?

Зарплата пришла. Сразу ушли аренда или ипотека, проценты, коммунальные платежи, транспорт, связь и подписки. Человек еще ничего не выбрал — а большая часть денег уже распределена.

Это не значит, что любой собственник или бизнес — враг. Но устройство потоков имеет значение: тот, кто владеет жильем, капиталом, платформой или инфраструктурой, получает доход снова и снова. Тот, у кого есть только собственное время, каждый месяц начинает заново.

Если технологии повышают производительность, а участие большинства в созданной ценности по-прежнему ограничено зарплатой, разрыв может расти даже в богатеющем обществе.

Abundance ищет другой контур: вклад → подтвержденный результат → доверие → новые возможности → участие в дальнейшем росте. Но что будет с прежним контуром, когда часть работы заберет AI?$system_ru$,
  $system_en$Why does a salary end before the month does?

The salary arrives. Rent or a mortgage, interest, utilities, transport, connectivity, and subscriptions leave immediately. A person has not chosen anything yet, but most of the money has already been allocated.

This does not make every owner or business an enemy. But the direction of flows matters. Owners of housing, capital, platforms, or infrastructure can receive recurring income. A person who owns only their time starts again each month.

If technology raises productivity while most people participate in the value only through wages, the gap can grow even inside a wealthier society.

Abundance explores another loop: contribution → verified result → trust → new opportunity → participation in further growth. What happens to the old loop when AI performs part of the work?$system_en$,
  'https://images.unsplash.com/photo-1753955900083-b62ee8d97805?auto=format&fit=crop&w=1200&q=82',
  'Счета, калькулятор и ноутбук во время подсчета расходов',
  'Bills, a calculator, and a laptop during household budgeting',
  'https://unsplash.com/photos/bills-calculator-and-a-laptop-financial-tasks-underway-LtU_A0NHHtU'
),
(
  'a1800000-0000-4000-8000-000000000004',
  'system_story:04-ai-and-work',
  4,
  'interpretation',
  'source_required',
  'system_story:05-power-and-appeal',
  $system_ru$Если AI будет работать за нас, почему люди боятся остаться без работы?

Нам десятилетиями обещали, что технологии освободят время. Но когда AI действительно начинает выполнять часть работы, первая мысль у многих не «наконец-то отдохну», а «на что я буду жить?»

Проблема не в самой автоматизации. Она может убрать рутину, сделать услуги дешевле и дать людям больше возможностей. Страх появляется потому, что доступ к жизни по-прежнему почти полностью привязан к рабочему месту и зарплате.

Если машина создает больше ценности, а человек просто теряет прежнюю роль, свободное время превращается не в свободу, а в тревогу.

Abundance пытается заранее построить дополнительные пути: через вклад, обучение, проекты, взаимную помощь и участие в созданном результате. Для этого нельзя оставлять все решения одному работодателю, платформе или алгоритму.$system_ru$,
  $system_en$If AI works for us, why are people afraid of losing work?

Technology has promised to free our time for decades. Yet when AI begins doing real tasks, the first thought is often not “I can finally rest,” but “How will I live?”

Automation itself is not the problem. It can remove routine, make services cheaper, and create new possibilities. The fear appears because access to ordinary life is still tied almost completely to a job and a wage.

If a machine creates more value while a person simply loses their previous role, free time becomes anxiety rather than freedom.

Abundance tries to build additional paths in advance: contribution, learning, projects, mutual help, and participation in the result created. That requires decisions not to remain under one employer, platform, or algorithm.$system_en$,
  'https://images.unsplash.com/photo-1764001276717-06fb8d0783db?auto=format&fit=crop&w=1200&q=82',
  'Сотрудник работает за компьютером в современном офисе',
  'An employee works at a computer in a modern office',
  'https://unsplash.com/photos/man-working-on-a-computer-in-an-office-setting-jEr29j1pmms'
),
(
  'a1800000-0000-4000-8000-000000000005',
  'system_story:05-power-and-appeal',
  5,
  'principle',
  'editorial',
  'system_story:06-coordination-gap',
  $system_ru$Почему один чужой клик может изменить всю жизнь человека?

Банк заблокировал счет. Платформа изменила правила. Руководитель закрыл проект. Алгоритм снизил охваты. Иногда одно непрозрачное решение отделяет человека от денег, работы или аудитории — и даже непонятно, кому задать вопрос.

Не обязательно считать всех руководителей плохими. Проблема появляется, когда у большой власти нет понятных ограничений, проверки и работающего способа оспорить решение. Даже хорошие люди ошибаются и защищают собственные интересы.

Abundance не ищет идеального правителя. Система должна распределять полномочия, показывать правила, сохранять историю решений и давать человеку право на объяснение, пересмотр и выход.

Но прозрачных правил мало, если система не умеет соединять людей и действия. Следующая проблема намного ближе к повседневной жизни.$system_ru$,
  $system_en$Why can one click by someone else change a person’s whole life?

A bank freezes an account. A platform changes its rules. A manager closes a project. An algorithm reduces reach. One opaque decision can separate a person from money, work, or an audience, with nobody obvious to ask.

We do not need to assume that every leader is bad. The problem appears when significant power has no visible limits, review, or working appeal. Good people also make mistakes and protect their own interests.

Abundance is not searching for a perfect ruler. The system should distribute authority, expose rules, preserve a history of decisions, and give people the right to an explanation, review, and exit.

Transparent rules are still not enough if a system cannot connect people with action. The next problem is part of everyday life.$system_en$,
  'https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?auto=format&fit=crop&w=1200&q=82',
  'Человек устал перед ноутбуком после непонятного цифрового решения',
  'A person feels frustrated in front of a laptop after an opaque digital decision',
  'https://unsplash.com/s/photos/frustrated-laptop'
),
(
  'a1800000-0000-4000-8000-000000000006',
  'system_story:06-coordination-gap',
  6,
  'mechanism',
  'editorial',
  'system_story:07-connected-path',
  $system_ru$Почему после сотни сохраненных советов жизнь не меняется?

Телефон полон сохраненных видео: как сменить работу, начать проект, выучить язык, накопить деньги. Советы хорошие. Мотивация иногда тоже есть. Но вечером снова непонятно, что именно сделать сегодня.

Людям часто хватает информации. Не хватает связки между желанием и конкретным действием: с чего начать, кто может помочь, где найти подходящую задачу и как понять, что шаг действительно дал результат.

Abundance строится именно как такая связка. Желание превращается в цель, цель — в небольшой шаг Today, результат подтверждается, а полученный опыт становится частью следующего шага.

Но разве для этого мало заметок, AI-чата и социальной сети? Каждого инструмента по отдельности — да. Вопрос в том, как они соединены.$system_ru$,
  $system_en$Why does life stay the same after a hundred saved pieces of advice?

The phone is full of videos about changing careers, starting projects, learning languages, and saving money. The advice can be good. Motivation appears sometimes too. Yet by evening it is still unclear what to do today.

People often do not lack information. They lack the connection between a wish and a concrete action: where to begin, who can help, where a fitting task exists, and how to know whether a step produced a real result.

Abundance is designed as that connection. A wish becomes a goal, the goal becomes a small Today action, the result is verified, and the experience becomes part of the next step.

A notes app, AI chat, and social network each solve a piece. The important question is how those pieces connect.$system_en$,
  'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=1200&q=82',
  'Планер и множество задач на рабочем столе',
  'A planner and many tasks on a busy desk',
  'https://unsplash.com/s/photos/daily-planner'
),
(
  'a1800000-0000-4000-8000-000000000007',
  'system_story:07-connected-path',
  7,
  'mixed',
  'editorial',
  'system_story:08-portable-contribution',
  $system_ru$Зачем еще одно приложение, если их и так слишком много?

В одном приложении мы записываем цели. В другом задаем вопросы AI. В третьем ищем людей, в четвертом — работу, в пятом — обучение. Инструментов много, но собирать из них собственную жизнь все равно приходится вручную.

Abundance нужен не как еще одна лента или еще один чат. Его задача — соединить разрозненные части в понятный путь: желание → план → действие → результат → доверие → новая возможность.

AI помогает понять контекст и предложить следующий шаг. People дает доступ к опыту людей. Challenges превращают намерение в действие. Core, Trust и Influence сохраняют подтвержденный результат.

Не человек должен постоянно переносить смысл между приложениями — система должна поддерживать его путь целиком. Но как сохранять результат, не превращая человека в одну цифру?$system_ru$,
  $system_en$Why add another app when there are already too many?

We record goals in one app, ask AI questions in another, find people in a third, search for work in a fourth, and learn in a fifth. There are plenty of tools, yet a person still has to assemble a life from them by hand.

Abundance is not meant to be another feed or chat. Its job is to connect scattered parts into a path: wish → plan → action → result → trust → new opportunity.

AI helps understand context and suggest a next step. People opens access to experience. Challenges turn intention into action. Core, Trust, and Influence preserve verified results.

A person should not have to carry meaning manually between apps. The system should support the whole path. But how can it preserve results without reducing someone to a single number?$system_en$,
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=82',
  'Несколько цифровых инструментов и графиков на экране',
  'Several digital tools and dashboards on a screen',
  'https://unsplash.com/s/photos/digital-workflow'
),
(
  'a1800000-0000-4000-8000-000000000008',
  'system_story:08-portable-contribution',
  8,
  'mechanism',
  'editorial',
  'system_story:09-transparent-algorithms',
  $system_ru$Почему на каждом новом месте приходится доказывать себя с нуля?

Человек годами учится, помогает коллегам, выполняет обещания и решает сложные задачи. Потом приходит в новое место — и снова перед ним пустой профиль, тестовое задание и вопрос: «А вы точно умеете?»

Репутация сегодня разбросана по резюме, отзывам, платформам и чужой памяти. Abundance пытается сохранять подтвержденный путь, но не сводить личность к одному рейтингу.

Core показывает накопленный вклад. Trust — насколько надежно человек выполняет обязательства в конкретном контексте. Influence — помогает ли его работа двигаться другим людям. Ни один из этих сигналов не равен ценности человека.

Сигналы нужны, чтобы быстрее находить подходящие возможности и меньше начинать с нуля. Но если их считает алгоритм, кто проверяет уже сам алгоритм?$system_ru$,
  $system_en$Why must people prove themselves from zero in every new place?

Someone can spend years learning, helping colleagues, keeping promises, and solving hard problems. Then they enter a new environment and face an empty profile, another test task, and the question: “Can you really do it?”

Reputation is scattered across résumés, reviews, platforms, and other people’s memory. Abundance tries to preserve a verified path without reducing a person to one rating.

Core reflects accumulated contribution. Trust shows reliability in a particular context. Influence reflects whether someone’s work helps others move forward. None of these signals equals a person’s worth.

Signals should make fitting opportunities easier to find and reduce the need to start again. But if an algorithm calculates them, who checks the algorithm?$system_en$,
  'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=1200&q=82',
  'Резюме и рабочие документы рядом с ноутбуком',
  'A resume and work documents beside a laptop',
  'https://unsplash.com/s/photos/resume-job-search'
),
(
  'a1800000-0000-4000-8000-000000000009',
  'system_story:09-transparent-algorithms',
  9,
  'mixed',
  'editorial',
  'system_story:10-first-personal-step',
  $system_ru$Почему алгоритм знает о нас много, а мы не знаем, почему он решил?

Лента решила, что нам показывать. Банк — можно ли доверить кредит. Платформа — кому дать заказ. Мы видим результат, но редко видим правило, которое к нему привело.

Алгоритм может распределять возможности быстрее человека. Но непрозрачный алгоритм не убирает власть — он просто прячет ее за удобным интерфейсом.

В Abundance автоматическое решение должно оставлять понятный след: какие данные использованы, какое правило сработало, кто может его изменить и как человек может оспорить результат или отказаться.

Smart contracts помогают выполнять заранее согласованные условия без ручного посредника. Но код не становится справедливым автоматически. Поэтому нужны человеческая проверка, прозрачная процедура изменений и защита от ошибки системы.

А с чего человеку начать знакомство с такой большой идеей? Не с изучения протокола — со своей жизни.$system_ru$,
  $system_en$Why does an algorithm know so much about us while we do not know why it decided?

A feed chooses what to show. A bank decides whether to offer credit. A platform chooses who receives a task. We see the outcome but rarely the rule that produced it.

Algorithms can distribute opportunities faster than people. An opaque algorithm does not remove power; it hides power behind a convenient interface.

In Abundance, an automated decision should leave an understandable trail: which data was used, which rule fired, who can change it, and how a person can appeal or opt out.

Smart contracts can execute agreed conditions without a manual intermediary, but code does not become fair automatically. Human review, a transparent change process, and protection from system errors remain necessary.

How should someone approach such a large idea? Not by studying a protocol first, but through their own life.$system_en$,
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=82',
  'Цифровая сеть данных как образ работы алгоритмов',
  'A digital data network representing algorithmic decisions',
  'https://unsplash.com/s/photos/algorithm-technology'
),
(
  'a1800000-0000-4000-8000-000000000010',
  'system_story:10-first-personal-step',
  10,
  'invitation',
  'editorial',
  'system_story:11-positive-sum',
  $system_ru$Почему важное желание месяцами остается в списке «когда-нибудь»?

Сменить работу. Запустить свое дело. Больше быть с семьей. Наконец заняться здоровьем. Желание может быть настоящим — и все равно месяцами жить в заметках, потому что первый шаг кажется слишком большим или непонятным.

Abundance не предлагает сначала поверить в новую экономику. Начало намного проще: выбрать одно желание, поставить примерную цель и найти действие, которое можно выполнить сегодня.

После первого результата появляется не магическая уверенность, а полезная информация: что получилось, где возникла сложность, какая помощь нужна дальше. Так туманная мечта превращается в проверяемый путь.

Можно просто попробовать один шаг и решить, подходит ли такой формат. Иногда этого достаточно, чтобы перестать смотреть на чужой рост как на доказательство собственного отставания.$system_ru$,
  $system_en$Why does an important wish remain on the “someday” list for months?

Change jobs. Start a small business. Spend more time with family. Take care of health. A wish can be genuine and still live in notes for months because the first step feels too large or unclear.

Abundance does not ask someone to believe in a new economy first. The beginning is much simpler: choose one wish, set a rough goal, and find an action that can be completed today.

The first result does not create magical confidence. It creates useful information: what worked, where difficulty appeared, and what help is needed next. A vague dream becomes a path that can be tested.

Try one step and decide whether the format fits. Sometimes that is enough to stop treating another person’s growth as proof of your own delay.$system_en$,
  'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=82',
  'Человек записывает первую конкретную цель в блокнот',
  'A person writes a first concrete goal in a notebook',
  'https://unsplash.com/s/photos/writing-goals'
),
(
  'a1800000-0000-4000-8000-000000000011',
  'system_story:11-positive-sum',
  11,
  'principle',
  'editorial',
  'system_story:12-test-before-belief',
  $system_ru$Почему чужой успех иногда кажется плохой новостью?

Кто-то получил работу — значит, место занято. Кто-то купил квартиру — цены выросли. Кто-то запустил успешный проект — придется конкурировать. В системе с ограниченным числом входов чужой успех легко воспринимать как собственную потерю.

Abundance стремится создавать другой эффект. Освоенный навык становится инструкцией для следующего человека. Решенная задача открывает новый проект. Репутация помогает собрать команду. Часть созданной ценности возвращается тем, без кого рост не состоялся.

Это и называется положительной суммой: успех одного увеличивает число возможностей для других. Он не возникает сам — нужны правила, которые замечают вклад и защищают людей от эксплуатации.

Звучит хорошо. Но как отличить рабочую систему от очередного красивого обещания? Только попробовать ее на небольшом реальном шаге.$system_ru$,
  $system_en$Why can someone else’s success feel like bad news?

Someone gets a job, so the place is gone. Someone buys a home, so prices rise. Someone launches a successful project, so others must compete. When a system has few entry points, another person’s success can feel like our loss.

Abundance aims for a different effect. A learned skill becomes a guide for the next person. A solved task opens a new project. Reputation helps assemble a team. Part of the created value returns to people without whom the growth would not have happened.

This is positive sum: one person’s success increases the number of opportunities for others. It does not happen automatically. Rules must recognize contribution and protect people from exploitation.

How do we distinguish a working system from a beautiful promise? By testing it on one small, real step.$system_en$,
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=82',
  'Небольшая команда вместе работает над проектом',
  'A small team works together on a project',
  'https://unsplash.com/s/photos/team-collaboration'
),
(
  'a1800000-0000-4000-8000-000000000012',
  'system_story:12-test-before-belief',
  12,
  'invitation',
  'editorial',
  null,
  $system_ru$Почему Abundance не просит верить ему на слово?

Люди уже слышали много обещаний: быстро разбогатеть, найти предназначение, изменить жизнь за несколько недель. Здоровая реакция на еще одну большую идею — сомнение.

Поэтому Abundance не нужно принимать целиком на веру. Можно зайти из любопытства, выбрать желание, поставить примерную цель и выполнить одну небольшую задачу. Затем посмотреть на результат: стало ли понятнее, появился ли новый вариант, человек или следующий шаг?

Возможно, сейчас вам нужен только один ответ. Возможно, позже появятся навык, команда или проект. А возможно, этот формат просто не подойдет — это тоже честный результат.

Решать, пробовать или нет, каждый будет сам. Но чтобы решить, стоит сначала увидеть, какой выбор вообще существует.$system_ru$,
  $system_en$Why does Abundance not ask to be taken on faith?

People have already heard many promises: get rich quickly, find a calling, transform life in a few weeks. Doubt is a healthy reaction to another large idea.

Abundance does not need to be accepted whole. Enter out of curiosity, choose a wish, set a rough goal, and complete one small task. Then look at the result. Is the situation clearer? Did a new option, person, or next step appear?

Perhaps one answer is enough for now. A skill, team, or project may appear later. The format may also prove unsuitable, and that is an honest result too.

Everyone decides whether to try. To make that decision, it helps to see which choices actually exist.$system_en$,
  'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&w=1200&q=82',
  'Человек с любопытством смотрит на результат небольшой задачи в телефоне',
  'A person looks curiously at the result of a small task on a phone',
  'https://unsplash.com/s/photos/phone-curiosity'
);

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
select
  story.id,
  null,
  story.source_key,
  'Abundance System',
  'system_story',
  'published',
  'public',
  story.body_ru,
  now() - ((story.series_order - 1) * interval '2 hours'),
  now() - ((story.series_order - 1) * interval '2 hours')
from reality_feed_system_stories story
on conflict (id) do update
set
  source_key = excluded.source_key,
  author_label = excluded.author_label,
  post_type = excluded.post_type,
  status = excluded.status,
  visibility = excluded.visibility,
  body = excluded.body,
  deleted_at = null,
  updated_at = now();

insert into public.feed_post_translations (post_id, locale, author_name, body)
select story.id, localized.locale, localized.author_name, localized.body
from reality_feed_system_stories story
cross join lateral (
  values
    ('ru'::text, 'Abundance System'::text, story.body_ru),
    ('en'::text, 'Abundance System'::text, story.body_en)
) localized(locale, author_name, body)
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
  sort_order,
  metadata
)
select
  story.id,
  'image',
  story.media_url,
  jsonb_build_object('ru', story.alt_ru, 'en', story.alt_en),
  story.source_url,
  'Unsplash',
  0,
  jsonb_build_object('layout', 'portrait', 'aspect_ratio', '4:5')
from reality_feed_system_stories story
on conflict (post_id, sort_order) do update
set
  media_type = excluded.media_type,
  media_url = excluded.media_url,
  alt_text = excluded.alt_text,
  source_url = excluded.source_url,
  source_label = excluded.source_label,
  metadata = excluded.metadata;

insert into public.feed_system_story_metadata (
  post_id,
  system_account_key,
  series_key,
  series_order,
  story_kind,
  evidence_status,
  next_story_key
)
select
  story.id,
  'abundance_system',
  'abundance_system_basics',
  story.series_order,
  story.story_kind,
  story.evidence_status,
  story.next_story_key
from reality_feed_system_stories story
on conflict (post_id) do update
set
  system_account_key = excluded.system_account_key,
  series_key = excluded.series_key,
  series_order = excluded.series_order,
  story_kind = excluded.story_kind,
  evidence_status = excluded.evidence_status,
  next_story_key = excluded.next_story_key;
