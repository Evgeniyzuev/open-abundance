-- «Вызовы» and «Миссии-тайны» (founder 2026-11-25, docs/WORD_CALLS_AND_MISSIONS.md).
-- A call: a person gives their word publicly, shows proof (text + optional video link), Nova checks it, then other
-- members vote. Kept: base reward × multiplier, where the multiplier grows when few people manage the call
-- (1 / share of kept, from 1 to 5, capped lower by the reserve light, and 1 until a call has 10 settled entries).
-- A mission: the same flow with a sealed task (only time, difficulty, deadline and reward are visible before taking it)
-- and no multiplier. On the line is the person's word, not money. Everything goes through the service API.

create table if not exists public.word_calls (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{3,40}$'),
  kind text not null check (kind in ('call', 'mission')),
  sphere text check (sphere is null or sphere in ('health', 'relations', 'money', 'career', 'learning', 'business', 'experience', 'purchases')),
  title jsonb not null,
  rule jsonb not null,
  proof_hint jsonb not null default '{}'::jsonb,
  minutes integer not null check (minutes between 1 and 1440),
  difficulty integer not null check (difficulty between 1 and 3),
  hours integer not null check (hours between 12 and 240),
  base_reward numeric(30, 12) not null check (base_reward >= 0 and base_reward <= 5),
  active boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.word_call_entries (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.word_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'taken' check (status in ('taken', 'submitted', 'kept', 'rejected', 'broken')),
  proof_text text check (proof_text is null or char_length(proof_text) <= 600),
  proof_url text check (proof_url is null or char_length(proof_url) <= 500),
  ai_verdict text check (ai_verdict is null or ai_verdict in ('ok', 'unclear', 'reject')),
  ai_note text check (ai_note is null or char_length(ai_note) <= 300),
  votes_yes integer not null default 0,
  votes_no integer not null default 0,
  multiplier numeric(6, 2) not null default 1,
  reward numeric(30, 12) not null default 0,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  settled_at timestamptz
);

create unique index if not exists word_call_entries_one_open_idx on public.word_call_entries (call_id, user_id) where status in ('taken', 'submitted');
create index if not exists word_call_entries_user_idx on public.word_call_entries (user_id, created_at desc);
create index if not exists word_call_entries_status_idx on public.word_call_entries (status, submitted_at);
create index if not exists word_call_entries_call_settled_idx on public.word_call_entries (call_id, settled_at desc) where settled_at is not null;

create table if not exists public.word_call_votes (
  entry_id uuid not null references public.word_call_entries(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  vote boolean not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, voter_id)
);
create index if not exists word_call_votes_voter_idx on public.word_call_votes (voter_id);

alter table public.word_calls enable row level security;
alter table public.word_call_entries enable row level security;
alter table public.word_call_votes enable row level security;
revoke all on public.word_calls, public.word_call_entries, public.word_call_votes from anon, authenticated;

-- One vote per member and entry; never on one's own entry, only while the entry waits for votes.
create or replace function public.vote_word_call(p_entry_id uuid, p_voter_id uuid, p_vote boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.word_call_entries%rowtype;
  v_rows integer;
begin
  select * into v_entry from public.word_call_entries where id = p_entry_id for update;
  if not found or v_entry.status <> 'submitted' or v_entry.user_id = p_voter_id then return false; end if;
  insert into public.word_call_votes (entry_id, voter_id, vote) values (p_entry_id, p_voter_id, p_vote) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  update public.word_call_entries
    set votes_yes = votes_yes + case when p_vote then 1 else 0 end,
        votes_no = votes_no + case when p_vote then 0 else 1 end
    where id = p_entry_id;
  return true;
end;
$$;

-- Settles what is ready. Missed deadline: broken. Submitted: decided at 3 votes, or after 48 hours with at least one
-- vote, or after 72 hours by Nova's check alone when nobody voted. Kept when yes > no (yes >= no + 2 if Nova said
-- «reject»). The reward goes to Core; p_max_multiplier comes from the reserve light (5 green, 3 yellow, 1 otherwise).
create or replace function public.settle_word_calls(p_max_multiplier numeric default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_kept boolean;
  v_settled integer;
  v_kept_count integer;
  v_mult numeric(6, 2);
  v_reward numeric(30, 12);
  v_max numeric := least(5, greatest(1, coalesce(p_max_multiplier, 1)));
  v_count integer := 0;
begin
  update public.word_call_entries set status = 'broken', settled_at = now()
    where status = 'taken' and deadline_at < now();
  get diagnostics v_count = row_count;

  for v_entry in
    select e.*, c.kind, c.base_reward, c.title as call_title
    from public.word_call_entries e join public.word_calls c on c.id = e.call_id
    where e.status = 'submitted'
      and (e.votes_yes + e.votes_no >= 3
        or (e.submitted_at < now() - interval '48 hours' and e.votes_yes + e.votes_no >= 1)
        or (e.submitted_at < now() - interval '72 hours'))
    order by e.submitted_at
    for update of e skip locked
  loop
    if v_entry.votes_yes + v_entry.votes_no = 0 then
      v_kept := v_entry.ai_verdict = 'ok';
    elsif v_entry.ai_verdict = 'reject' then
      v_kept := v_entry.votes_yes >= v_entry.votes_no + 2;
    else
      v_kept := v_entry.votes_yes > v_entry.votes_no;
    end if;

    v_mult := 1;
    if v_kept and v_entry.kind = 'call' then
      select count(*), count(*) filter (where status = 'kept') into v_settled, v_kept_count
        from public.word_call_entries
        where call_id = v_entry.call_id and settled_at > now() - interval '60 days' and status in ('kept', 'rejected', 'broken');
      if v_settled >= 10 then
        v_mult := case when v_kept_count = 0 then v_max else least(v_max, greatest(1, round(v_settled::numeric / v_kept_count, 1))) end;
      end if;
    end if;
    v_reward := case when v_kept then round(v_entry.base_reward * v_mult, 2) else 0 end;

    if v_reward > 0 then
      update public.core_accounts set balance = balance + v_reward, updated_at = now() where user_id = v_entry.user_id;
    end if;
    update public.word_call_entries
      set status = case when v_kept then 'kept' else 'rejected' end, multiplier = v_mult, reward = v_reward, settled_at = now()
      where id = v_entry.id;

    begin
      perform public.create_notification_event_raw(
        case when v_kept then 'word_call.kept' else 'word_call.rejected' end,
        'rewards',
        'word_call_entry',
        v_entry.id::text,
        case when v_kept then 'Слово сдержано' else 'Вызов не засчитан' end,
        coalesce(v_entry.call_title ->> 'ru', v_entry.call_title ->> 'en', ''),
        '/?view=challenges&tab=calls',
        array[v_entry.user_id],
        'word_call:' || v_entry.id::text || ':settled',
        jsonb_build_object('entry_id', v_entry.id, 'reward', v_reward, 'multiplier', v_mult),
        true
      );
    exception when others then
      null; -- a missing notification never blocks the reward
    end;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.vote_word_call(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.settle_word_calls(numeric) from public, anon, authenticated;
grant execute on function public.vote_word_call(uuid, uuid, boolean) to service_role;
grant execute on function public.settle_word_calls(numeric) to service_role;

-- Starting catalog. Texts in Russian and English; the app falls back to English for other languages.
insert into public.word_calls (key, kind, sphere, title, rule, proof_hint, minutes, difficulty, hours, base_reward, sort) values
  ('no_feed_24h', 'call', 'experience',
    '{"ru":"24 часа без ленты","en":"24 hours without the feed"}',
    '{"ru":"Сутки не открываешь ленты соцсетей и видео. Сообщения можно.","en":"For a day you don''t open social feeds or short videos. Messages are fine."}',
    '{"ru":"Напиши, что делал вместо ленты. Можно ссылку на скриншот экранного времени.","en":"Write what you did instead. A link to a screen-time screenshot helps."}',
    1440, 2, 48, 0.5, 10),
  ('old_friend', 'call', 'relations',
    '{"ru":"Напиши тому, с кем давно не говорил","en":"Text someone you haven''t talked to in ages"}',
    '{"ru":"Одно сообщение без повода человеку, с которым не общался полгода и больше.","en":"One message, no reason needed, to someone you haven''t talked to for half a year or more."}',
    '{"ru":"Что ответили? Без имён.","en":"What did they answer? No names."}',
    5, 1, 24, 0.3, 20),
  ('walk_no_phone', 'call', 'health',
    '{"ru":"30 минут пешком без телефона","en":"30 minutes on foot without a phone"}',
    '{"ru":"Полчаса прогулки, телефон дома или в рюкзаке выключен.","en":"Half an hour of walking, the phone stays home or off in a bag."}',
    '{"ru":"Что заметил по дороге?","en":"What did you notice on the way?"}',
    30, 1, 24, 0.3, 30),
  ('cold_shower_3', 'call', 'health',
    '{"ru":"Три дня холодный душ","en":"Three days of cold showers"}',
    '{"ru":"Три дня подряд заканчиваешь душ минутой холодной воды.","en":"Three days in a row you finish your shower with a minute of cold water."}',
    '{"ru":"Как менялось ощущение от первого дня к третьему? Можно ссылку на видео.","en":"How did it change from day one to day three? A video link is welcome."}',
    3, 2, 96, 0.5, 40),
  ('sell_unused', 'call', 'money',
    '{"ru":"Продай вещь, которой не пользуешься","en":"Sell something you don''t use"}',
    '{"ru":"За трое суток продай одну ненужную вещь: в Маркете, на Авито или знакомым.","en":"Within three days sell one thing you don''t need: in the Market, online or to friends."}',
    '{"ru":"Что продал и за сколько? Ссылка на объявление поможет.","en":"What did you sell and for how much? A listing link helps."}',
    30, 3, 72, 1.0, 50),
  ('never_done', 'call', 'experience',
    '{"ru":"Сделай то, чего ни разу не делал","en":"Do something you have never done"}',
    '{"ru":"Что угодно новое и безопасное: блюдо, место, разговор, занятие.","en":"Anything new and safe: a dish, a place, a conversation, an activity."}',
    '{"ru":"Что это было и каково было в первый раз? Можно ссылку на видео.","en":"What was it and how did the first time feel? A video link is welcome."}',
    60, 2, 72, 0.7, 60),
  ('dream_company', 'call', 'career',
    '{"ru":"Позвони в компанию мечты","en":"Call your dream company"}',
    '{"ru":"Позвони или напиши в компанию, где хотел бы работать, и спроси, кого они ищут.","en":"Call or write to a company you''d love to work for and ask who they are looking for."}',
    '{"ru":"Что ответили?","en":"What did they say?"}',
    5, 3, 72, 0.7, 70),
  ('m_help_request', 'mission', 'relations',
    '{"ru":"Один человек ждёт твоей помощи","en":"Someone is waiting for your help"}',
    '{"ru":"Открой «Просьбу через Нову» на Главной (под «Ещё») и ответь на одну чужую просьбу. Он не узнает твоё имя, пока ты сам не решишь.","en":"Open «Request via Nova» on Home (under More) and answer one request. They won''t learn your name unless you choose."}',
    '{"ru":"Чем помог?","en":"How did you help?"}',
    10, 1, 24, 0.3, 110),
  ('m_compliment', 'mission', 'experience',
    '{"ru":"Комплимент незнакомцу","en":"A compliment to a stranger"}',
    '{"ru":"Скажи искренний комплимент незнакомому человеку: кассиру, соседу, прохожему.","en":"Give a sincere compliment to a stranger: a cashier, a neighbour, a passer-by."}',
    '{"ru":"Как он отреагировал?","en":"How did they react?"}',
    2, 2, 24, 0.3, 120),
  ('m_market_listing', 'mission', 'business',
    '{"ru":"Твоя первая витрина","en":"Your first shop window"}',
    '{"ru":"Выставь в Маркете услугу из того, что у тебя получается лучше других. Цена небольшая, это первый шаг.","en":"List in the Market a service from what you do better than others. A small price, it''s a first step."}',
    '{"ru":"Ссылка на объявление.","en":"Link to the listing."}',
    15, 2, 72, 0.5, 130),
  ('m_squats', 'mission', 'health',
    '{"ru":"Прямо сейчас","en":"Right now"}',
    '{"ru":"20 приседаний прямо сейчас, где бы ты ни был. Потом запиши, как себя чувствуешь.","en":"20 squats right now, wherever you are. Then write how you feel."}',
    '{"ru":"Как себя чувствуешь?","en":"How do you feel?"}',
    3, 1, 24, 0.2, 140),
  ('m_money_leak', 'mission', 'money',
    '{"ru":"Найди утечку","en":"Find the leak"}',
    '{"ru":"Найди одну подписку или регулярную трату, которая тебе не нужна, и отмени её.","en":"Find one subscription or regular expense you don''t need and cancel it."}',
    '{"ru":"Что отменил и сколько это в месяц?","en":"What did you cancel and how much a month?"}',
    10, 1, 48, 0.3, 150),
  ('m_learn_one', 'mission', 'learning',
    '{"ru":"Один урок","en":"One lesson"}',
    '{"ru":"Посмотри один урок по навыку, который давно хотел освоить, и сделай одно упражнение из него.","en":"Watch one lesson on a skill you have wanted for long and do one exercise from it."}',
    '{"ru":"Что за навык и что получилось?","en":"Which skill and what came out?"}',
    30, 2, 48, 0.3, 160),
  ('m_ask_insider', 'mission', 'career',
    '{"ru":"Вопрос изнутри","en":"A question from inside"}',
    '{"ru":"Напиши человеку, который работает там, где ты хотел бы, и задай ему один вопрос о работе.","en":"Write to someone who works where you would like to and ask them one question about the job."}',
    '{"ru":"Что ответили?","en":"What did they answer?"}',
    10, 3, 72, 0.5, 170),
  ('m_wait_24h', 'mission', 'purchases',
    '{"ru":"Пауза перед покупкой","en":"A pause before buying"}',
    '{"ru":"Перед следующей покупкой не для еды подожди 24 часа и реши заново.","en":"Before your next non-food purchase wait 24 hours and decide again."}',
    '{"ru":"Купил в итоге или нет?","en":"Did you buy it in the end?"}',
    1, 1, 72, 0.2, 180),
  ('m_new_place', 'mission', 'experience',
    '{"ru":"Белое пятно на карте","en":"A blank spot on the map"}',
    '{"ru":"Сходи туда, где ни разу не был, в двух километрах от дома.","en":"Go somewhere within two kilometres of home where you have never been."}',
    '{"ru":"Что там нашёл?","en":"What did you find there?"}',
    30, 2, 48, 0.3, 190)
on conflict (key) do nothing;
