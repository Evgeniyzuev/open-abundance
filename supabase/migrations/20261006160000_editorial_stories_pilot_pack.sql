-- Eight editorial stories for the pilot feed. They are signed by the editorial team,
-- written as narratives (not as testimonials from named participants) and avoid income
-- or result claims. Each maps to a recommended wish in lib/wishJourney.ts.
-- Stable source keys and ids make the migration safe to re-run.

create temporary table pilot_pack_stories (
  id uuid primary key,
  source_key text not null,
  position integer not null,
  body_ru text not null,
  body_en text not null
) on commit drop;

insert into pilot_pack_stories (id, source_key, position, body_ru, body_en)
values
(
  'a1700000-0000-4000-8000-000000000029',
  'editorial_story:what-is-easy',
  1,
  $ru$«Что тебе даётся легко?» — спросила Нова, а я не нашла ответа

Я хотела начать что-то своё, но на вопрос «что ты можешь предложить людям?» у меня в голове была пустота. Все умения казались слишком обычными, чтобы за них кто-то заплатил.

Вечером я открыла чат с Новой и написала честно: не знаю, с чего начать. Она не стала предлагать великую идею. Она спросила, о чём меня просят друзья. Я вспомнила: уже второй год я правлю чужие тексты — письма, объявления, посты. Мне это нравится, и я делаю это быстро.

В Abundance я выбрала одно направление и одну маленькую задачу: отредактировать короткий пост. Первым «клиентом» стала я сама: взяла свой старый пост, улучшила его и сохранила «до» и «после». На это ушло двадцать минут. Через два дня я показала пример подруге, и она спросила, не посмотрю ли я её текст.

Я до сих пор не называю это бизнесом. Но теперь, когда меня спрашивают, что я умею, у меня есть готовый ответ и пример, который можно показать.$ru$,
  $en$“What comes easily to you?” Nova asked, and I had no answer

I wanted to start something of my own, but when I asked myself what I could offer people, my mind went blank. Every skill I had seemed too ordinary for anyone to pay for.

One evening I opened a chat with Nova and wrote honestly that I did not know where to start. She did not suggest a grand idea. She asked what my friends usually ask me for. I realised that for two years I had been fixing other people’s texts: letters, announcements, posts. I enjoy it and I do it quickly.

In Abundance I chose one direction and one small task: editing a short post. My first “client” was me. I took an old post, improved it, and saved the before and after. It took twenty minutes. Two days later I showed the example to a friend, and she asked whether I could look at her text.

I still do not call it a business. But now, when someone asks what I can do, I have an answer and an example I can show.$en$
),
(
  'a1700000-0000-4000-8000-00000000002a',
  'editorial_story:first-listing',
  2,
  $ru$Первое объявление: я назвала цену и не стала её убирать

Карточку на маркетплейсе я собирала три вечера. Не потому что она сложная — потому что страшно было написать цену. Любая цифра казалась или слишком высокой, или обидно низкой.

В итоге я сделала так: описала услугу двумя предложениями, указала срок выполнения и поставила цену, при которой мне самой было бы не жалко потратить время. Потом нажала «опубликовать» и закрыла телефон, чтобы не проверять каждые пять минут.

Первые сутки никто не написал. Я решила, что идея не работает. На второй день пришло сообщение с одним вопросом про сроки. Сделки не случилось, но вопрос показал, чего не хватало в описании: я не написала, что нужно от заказчика. Я дополнила карточку.

Теперь это просто строчка в моём профиле, которая работает, пока я занимаюсь другими делами. А страшное слово «цена» стало обычным рабочим числом, которое можно поменять.$ru$,
  $en$My first listing: I named a price and did not take it down

It took me three evenings to put the Market card together. Not because it was complicated, but because I was afraid to write a price. Any number felt either too high or insultingly low.

In the end I did this: I described the service in two sentences, set a delivery time, and chose a price at which I would not mind spending my own time. Then I pressed publish and put my phone away so I would not check it every five minutes.

For the first day nobody wrote. I decided the idea did not work. On the second day I got a message with one question about timing. There was no deal, but the question showed what my description lacked: I had not said what I needed from the client. I added it to the card.

Now it is just a line in my profile that works while I do other things. And the frightening word “price” became an ordinary working number that I can change.$en$
),
(
  'a1700000-0000-4000-8000-00000000002b',
  'editorial_story:one-dollar-a-day',
  3,
  $ru$Подушка безопасности, которую я начал с одного доллара в день

Я много лет говорил себе, что начну копить, когда зарплата станет больше. Зарплата росла, а привычка так и не появилась. Каждый раз сумма «настоящего» накопления казалась такой большой, что проще было не начинать.

В Abundance я впервые открыл калькулятор и ради интереса поставил смешную сумму: один доллар в день. Он показал, сколько накопится за год, и это оказалось не смешно. Не космическая сумма, но реальная — чуть больше трёх с половиной сотен. И главное, я увидел, что подушка на несколько месяцев расходов — это не мечта, а вопрос срока.

Я записал желание «создать финансовую подушку» и разбил его на три шага: отдельный счёт, ежедневная сумма, дата первой проверки. Каждый вечер отметка в Today занимала десять секунд.

Через месяц я поднял ежедневную сумму. Не потому что стал богаче, а потому что первая оказалась такой лёгкой, что стало неловко не повысить.$ru$,
  $en$The safety cushion I started with one dollar a day

For years I told myself I would start saving when my salary grew. The salary grew, but the habit never appeared. Every time, the sum of “real” saving looked so large that it was easier not to begin.

In Abundance I opened the calculator for the first time and, out of curiosity, entered a laughable amount: one dollar a day. It showed what that would add up to in a year, and it was not laughable. Not a huge sum, but a real one, a little over three hundred and fifty. More importantly, I saw that a cushion for several months of expenses is not a dream but a question of time.

I wrote down the wish “build an emergency fund” and split it into three steps: a separate account, a daily amount, and a date for the first check. Each evening the mark in Today took ten seconds.

A month later I raised the daily amount. Not because I got richer, but because the first one felt so easy that it seemed awkward not to raise it.$en$
),
(
  'a1700000-0000-4000-8000-00000000002c',
  'editorial_story:three-steps-to-move',
  4,
  $ru$Переезд, который мы перестали откладывать, когда разбили его на три шага

Мы с мужем говорили о переезде два года. Каждый разговор заканчивался одинаково: «Надо всё продумать». А продумывать было нечего, потому что слово «переезд» в голове означало сразу всё: деньги, работу, школу, вещи, прощания.

Я записала желание «сменить жильё» в Abundance и, следуя подсказке, заставила себя написать три конкретных шага. Не «найти квартиру», а: определить бюджет аренды, выбрать три района, посмотреть по одному варианту в каждом.

Первый шаг я сделала в тот же вечер, за столом на кухне, и впервые мы с мужем обсудили не «переезжать или нет», а «сколько мы готовы платить». Этот разговор был гораздо легче.

Мы всё ещё живём на старом месте. Но у нас есть бюджет, три района и дата, когда мы поедем смотреть варианты. Раньше у нас было только «когда-нибудь».$ru$,
  $en$The move we stopped postponing when we split it into three steps

My husband and I had talked about moving for two years. Every conversation ended the same way: “We need to think it through.” But there was nothing to think through, because in our heads the word “move” meant everything at once: money, work, school, belongings, goodbyes.

I wrote down the wish “move to a new home” in Abundance and, following the prompt, forced myself to write three concrete steps. Not “find an apartment,” but: decide a rent budget, choose three neighbourhoods, look at one option in each.

I did the first step that same evening, at the kitchen table, and for the first time my husband and I discussed not “whether to move” but “how much we are willing to pay.” That conversation was much easier.

We still live in the old place. But we have a budget, three neighbourhoods, and a date for going to look at options. Before, we only had “someday.”$en$
),
(
  'a1700000-0000-4000-8000-00000000002d',
  'editorial_story:route-by-steps',
  5,
  $ru$Поездка, которую я планировал пять лет, начиналась с одного вечера в неделю

Список мест у меня был давно: он лежал в заметках и раз в год пополнялся. Но между списком и билетами всегда был провал, который я называл «когда будет время».

Я решил превратить мечту в маршрут. В Abundance записал желание и подписал рядом реальные вещи: сколько стоит дорога, на сколько дней я могу уехать, сколько откладывать в месяц. Цифры были неприятными, но честными. Зато исчезло ощущение, что путешествие — что-то недоступное и далёкое.

Дальше я выделил один вечер в неделю. Не на отпуск, а на подготовку: в понедельник сравнивал маршруты, во вторник проверял визы, через неделю — искал жильё. Три вечера дали больше, чем пять лет размышлений.

Я не говорю, что всё уже куплено. Но у поездки появились даты, бюджет и первый оплаченный шаг. Это совсем другое чувство, чем «когда-нибудь».$ru$,
  $en$The trip I planned for five years started with one evening a week

I had a list of places for a long time. It sat in my notes and grew once a year. But between the list and the tickets there was always a gap I called “when I have time.”

I decided to turn the dream into a route. In Abundance I wrote the wish and added real things beside it: how much the journey costs, how many days I can be away, how much to set aside each month. The numbers were unpleasant but honest. And the feeling that travelling was something distant and unreachable disappeared.

Then I set aside one evening a week. Not for a holiday, but for preparation: on Monday I compared routes, on Tuesday I checked visas, a week later I looked for places to stay. Three evenings gave me more than five years of thinking.

I am not saying everything is booked. But the trip now has dates, a budget, and a first paid step. It is a very different feeling from “someday.”$en$
),
(
  'a1700000-0000-4000-8000-00000000002e',
  'editorial_story:first-thousand-lesson',
  6,
  $ru$Что я понял про сложный процент, когда пересчитал его на себе

В школе нам рассказывали о сложном проценте так, что слово «формула» вызывало зевоту. Я запомнил только, что он «растёт всё быстрее», и не поверил, что это имеет отношение к моей жизни.

В Abundance был короткий тест по закону Core, и я решил пройти его просто из любопытства. Два вопроса я решил неправильно. Это задело, и я пошёл в калькулятор проверять, что именно упустил.

Я поставил свою обычную ежедневную сумму и сравнил два сценария: забирать всё сразу и возвращать часть обратно. Разница на пяти годах была не космической, но заметной. А на десяти — заметной уже слишком, чтобы её игнорировать.

Я не стал богаче в тот вечер. Но я перестал думать, что первые небольшие суммы «ничего не значат». Они значат время, а время — главный множитель в этой истории.

Сейчас я смотрю на небольшие ежедневные шаги иначе: это не мелочь, а старт длинной кривой.$ru$,
  $en$What I understood about compound growth when I recalculated it for myself

At school compound interest was explained in a way that made the word “formula” a yawn. All I remembered was that it “grows faster and faster,” and I did not believe it had anything to do with my life.

Abundance has a short quiz on the Core law, and I took it out of curiosity. I got two questions wrong. That stung, so I went to the calculator to check what I had missed.

I entered my usual daily amount and compared two scenarios: taking everything out at once and putting part of it back. The difference at five years was not dramatic but visible. At ten years it was too visible to ignore.

I did not get richer that evening. But I stopped thinking that the first small sums “mean nothing.” They mean time, and time is the main multiplier in this story.

Now I look at small daily steps differently: not as trifles, but as the start of a long curve.$en$
),
(
  'a1700000-0000-4000-8000-00000000002f',
  'editorial_story:coming-back',
  7,
  $ru$Я пропала на три недели, а вернуться оказалось проще, чем я боялась

Серия прервалась в самый неудачный момент: болел ребёнок, на работе горел проект, и приложение просто выпало из дня. Когда стало легче, я долго не открывала его. Мне казалось, что придётся оправдываться перед пустым экраном и начинать «с нуля».

Я открыла Abundance в воскресенье вечером, из чистого любопытства. Никто не упрекнул. Я увидела свои желания на тех же местах и один маленький шаг в Today, который можно сделать за пять минут. Серия началась заново, но опыт и желания никуда не делись.

В этот день я выполнила только один шаг и закрыла приложение. На следующий — снова один. Через несколько дней я поймала себя на том, что снова жду вечернего времени для себя.

Теперь я знаю, что пропуск — это не провал. Это пауза, и у неё есть простое продолжение: один маленький шаг сегодня.$ru$,
  $en$I vanished for three weeks, and coming back was easier than I feared

My streak broke at the worst moment: my child was ill, a project at work was on fire, and the app simply dropped out of my day. When things eased, I did not open it for a long time. I felt I would have to explain myself to an empty screen and start “from zero.”

I opened Abundance on a Sunday evening, out of plain curiosity. Nobody reproached me. I saw my wishes in the same places and one small step in Today that I could do in five minutes. The streak started again, but my experience and my wishes had not gone anywhere.

That day I did only one step and closed the app. The next day, one more. A few days later I caught myself looking forward to my evening time for myself again.

Now I know that a gap is not a failure. It is a pause, and it has a simple continuation: one small step today.$en$
),
(
  'a1700000-0000-4000-8000-000000000030',
  'editorial_story:neighbour-and-phone',
  8,
  $ru$Я помог соседу настроить телефон, и оказалось, что это тоже умение

Сосед с третьего этажа попросил помочь с новым смартфоном: перенести контакты, настроить почту, установить мессенджер. Я справился минут за сорок и не придал этому значения — для меня это было как налить чай.

Через неделю он рассказал об этом своей сестре, и она написала мне: у неё то же самое с планшетом. Тогда я впервые подумал, что навык, который кажется мне очевидным, для других — настоящая проблема, и они готовы за решение отблагодарить.

Я записал в Abundance то, что делал в обоих случаях, как короткий чек-лист: пять пунктов, которые можно показать следующему человеку. Потом сделал на его основе карточку услуги и поставил небольшую цену.

Не уверен, что это превратится в дело. Но я перестал считать «простое» бесполезным. Иногда самое востребованное — это то, что мы делаем, не замечая.$ru$,
  $en$I helped a neighbour set up his phone, and it turned out to be a skill too

A neighbour from the third floor asked me to help with a new smartphone: move his contacts, set up email, install a messenger. I finished in about forty minutes and did not think much of it. For me it was like pouring tea.

A week later he told his sister, and she wrote to me: she had the same problem with a tablet. That was the first time I thought that a skill that seems obvious to me is a real problem for others, and they are ready to thank me for solving it.

In Abundance I wrote down what I had done in both cases as a short checklist: five points I could show to the next person. Then I made a service card from it and set a small price.

I am not sure it will become a business. But I stopped assuming that “simple” means useless. Sometimes the most needed thing is what we do without noticing.$en$
);

insert into public.feed_posts (
  id, author_user_id, source_key, author_label, post_type, status, visibility,
  body, system_verified, created_at, published_at
)
select
  id, null, source_key, 'Редакция Open Abundance', 'manual', 'published', 'public',
  split_part(body_ru, E'\n', 1), false,
  now() - make_interval(secs => position + 10), now() - make_interval(secs => position + 10)
from pilot_pack_stories
on conflict (id) do update
set
  author_user_id = excluded.author_user_id,
  source_key = excluded.source_key,
  author_label = excluded.author_label,
  post_type = excluded.post_type,
  status = excluded.status,
  visibility = excluded.visibility,
  body = excluded.body,
  system_verified = excluded.system_verified;

insert into public.feed_post_translations (post_id, locale, author_name, body)
select id, 'ru', 'Редакция Open Abundance', body_ru from pilot_pack_stories
union all
select id, 'en', 'Open Abundance Editorial', body_en from pilot_pack_stories
on conflict (post_id, locale) do update
set
  author_name = excluded.author_name,
  body = excluded.body;
