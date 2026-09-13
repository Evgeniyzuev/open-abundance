-- Five editorial first-person stories for the Reality Feed.
-- The stable source keys make this migration safe to re-run.

insert into public.feed_posts (
  id,
  author_user_id,
  source_key,
  author_label,
  post_type,
  status,
  visibility,
  body,
  system_verified,
  created_at,
  published_at
)
values
  (
    'a1700000-0000-4000-8000-000000000024',
    null,
    'editorial_story:front-row',
    'Редакция Open Abundance',
    'manual',
    'published',
    'public',
    $$«Мам, ты придёшь? Или опять работа?»$$,
    false,
    now() - interval '1 second',
    now() - interval '1 second'
  ),
  (
    'a1700000-0000-4000-8000-000000000025',
    null,
    'editorial_story:first-order',
    'Редакция Open Abundance',
    'manual',
    'published',
    'public',
    $$«У меня купили. Не знакомые. Не из жалости»$$,
    false,
    now() - interval '2 seconds',
    now() - interval '2 seconds'
  ),
  (
    'a1700000-0000-4000-8000-000000000026',
    null,
    'editorial_story:sea-for-mom',
    'Редакция Open Abundance',
    'manual',
    'published',
    'public',
    $$«Мама увидела море и вдруг замолчала»$$,
    false,
    now() - interval '3 seconds',
    now() - interval '3 seconds'
  ),
  (
    'a1700000-0000-4000-8000-000000000027',
    null,
    'editorial_story:our-own-key',
    'Редакция Open Abundance',
    'manual',
    'published',
    'public',
    $$«Первую ночь мы спали на полу. В своей квартире»$$,
    false,
    now() - interval '4 seconds',
    now() - interval '4 seconds'
  ),
  (
    'a1700000-0000-4000-8000-000000000028',
    null,
    'editorial_story:drawing-again',
    'Редакция Open Abundance',
    'manual',
    'published',
    'public',
    $$«В сорок три я всё ещё прятала свои рисунки»$$,
    false,
    now() - interval '5 seconds',
    now() - interval '5 seconds'
  )
on conflict (id) do update
set
  author_user_id = excluded.author_user_id,
  source_key = excluded.source_key,
  author_label = excluded.author_label,
  post_type = excluded.post_type,
  status = excluded.status,
  visibility = excluded.visibility,
  body = excluded.body,
  system_verified = excluded.system_verified,
  published_at = excluded.published_at;

insert into public.feed_post_translations (post_id, locale, author_name, body)
values
  (
    'a1700000-0000-4000-8000-000000000024',
    'ru',
    'Редакция Open Abundance',
    $$«Мам, ты придёшь? Или опять работа?»

В тот вечер Маша сказала это так тихо, будто заранее приготовилась к моему «не знаю». Я стояла у раковины, отвечала на рабочие сообщения и делала вид, что не устала. Утренник был в четверг, ровно в десять, а у меня — созвон с клиентом.

— Я постараюсь, — сказала я.

Маша кивнула, но больше ничего не спросила. Именно это и осталось со мной до ночи.

Я открыла Abundance не ради большой перемены. Просто записала в Goals желание: быть рядом с дочерью в обычные важные дни. В Today поставила первый шаг — честно показать команде свой календарь и попросить перенести созвон. Было страшно выглядеть недостаточно собранной, но разговор занял семь минут. Оказалось, клиенту тоже удобнее утром.

Потом я пересмотрела еще два рабочих окна, убрала привычку отвечать ночью и оставила в календаре время, которое нельзя занимать «на всякий случай». Первую неделю я всё равно несколько раз тянулась к ноутбуку во время ужина. Маша замечала и молча отодвигала его от меня.

В четверг я пришла в школу за десять минут до начала. Маша вышла на сцену, посмотрела в зал и сначала меня не увидела. Потом нашла глазами.

Она улыбнулась так, будто я подарила ей целый праздник. А я поняла: иногда изменить жизнь — это не уйти с работы, а вовремя закрыть ноутбук.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000024',
    'en',
    'Open Abundance Editorial',
    $$“Mom, will you come? Or will you be working again?”

Masha said it so quietly that she seemed prepared for my “I’m not sure.” I was standing at the sink, answering work messages, and pretending I was not tired. Her school performance was on Thursday at ten, exactly when I had a client call.

“I’ll try,” I said.

Masha nodded and asked nothing else. That silence stayed with me all night.

I opened Abundance without planning a dramatic change. I wrote one wish in Goals: to be there for the ordinary days that matter to my daughter. In Today, I chose one step — show my team my real calendar and ask to move the call. I was afraid it would make me look unreliable, but the conversation took seven minutes. The client actually preferred the morning.

I moved two more work blocks, stopped answering messages at night, and protected time that could not be booked “just in case.” For the first week, I still reached for my laptop during dinner. Masha noticed and quietly pushed it away.

On Thursday I arrived ten minutes early. Masha came onto the stage, looked across the room, and did not see me at first. Then she found me.

She smiled as if I had given her the whole celebration. I understood that changing a life can mean closing a laptop at the right time, not leaving a job.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000025',
    'ru',
    'Редакция Open Abundance',
    $$«У меня купили. Не знакомые. Не из жалости»

Ася сказала это в голосовом сообщении, а потом переслушала его три раза. Я понимаю почему. До этого она месяцами делала чашки по ночам и прятала их в шкафу, когда приходили гости.

— Они красивые, но кому они нужны? — спрашивала она.

В Goals Ася записала желание открыть своё маленькое дело, хотя слово «дело» казалось ей слишком громким. В Today поставила шаг попроще: выбрать три чашки, сфотографировать их при дневном свете и показать людям без оправданий.

Она почти отменила публикацию. На фотографии была неровная ручка, а в описании — честная фраза о том, сколько времени занимает каждая вещь. Никаких скидок «для друзей», никаких просьб поставить лайк. Просто три чашки и её имя.

Первые сутки не происходило ничего. Ася проверяла телефон между замесами глины и злилась на себя за надежду. На второй день пришло сообщение: «Можно заказать одну синюю? Это подарок сестре».

— Ты уверена, что это не знакомая? — спросила я.

Ася посмотрела на адрес доставки и засмеялась. Город был другой.

Вечером она завернула чашку в папиросную бумагу, положила в коробку маленькую открытку и долго держала посылку на кухонном столе. Первый заказ не сделал её знаменитой. Он сделал кое-что важнее: показал, что её работа может выйти из шкафа и встретиться с настоящим человеком.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000025',
    'en',
    'Open Abundance Editorial',
    $$“Someone bought it. Not a friend. Not out of pity.”

Asya said it in a voice message and then played it three times. I understood why. For months she had been making cups at night and hiding them in a cupboard whenever guests arrived.

“They’re pretty, but who needs them?” she asked.

In Goals, Asya wrote a wish to start a small business, although the word “business” felt too grand. In Today, she chose a smaller step: pick three cups, photograph them in daylight, and show them without an apology.

She almost cancelled the post. One handle was uneven, and the description honestly said how long each piece took. No friends-only discount, no request for likes. Just three cups and her name.

Nothing happened for the first day. Asya checked her phone between batches of clay and was angry at herself for hoping. On the second day, a message arrived: “Can I order the blue one? It’s a gift for my sister.”

“Are you sure she isn’t someone you know?” I asked.

Asya looked at the delivery address and laughed. It was in another city.

That evening she wrapped the cup in tissue paper, added a small card, and held the parcel on her kitchen table for a long time. The first order did not make her famous. It did something more useful: it showed that her work could leave the cupboard and meet a real person.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000026',
    'ru',
    'Редакция Open Abundance',
    $$«Мама увидела море и вдруг замолчала»

Лиза всю жизнь говорила, что ей ничего не нужно. Новая куртка? «Старая ещё хорошая». Поездка? «Не трать на меня». Даже когда я спрашивала, куда она хотела бы поехать, мама отвечала: «Мне и дома нормально».

Я верила ей, пока однажды не нашла в ящике старую открытку с морем. На обороте маминым почерком было написано: «Когда-нибудь увижу сама».

В Goals я записала не «подарить маме путешествие», а конкретное желание — провести с ней неделю у моря. Это было честнее: я не хотела устраивать красивый сюрприз, после которого мы обе устанем. В Today появился первый шаг: спросить, какие даты ей действительно удобны.

Мама долго смотрела на календарь.

— Ты же работаешь.
— Поэтому и спрашиваю заранее.

Мы выбрали небольшой город, прямой поезд и квартиру с кухней, чтобы не превращать поездку в марафон. Потом я перенесла два проекта и впервые не стала извиняться за отпуск.

В день отъезда мама взяла с собой старую открытку. У моря она сняла пальто, подошла к воде и замолчала. Я испугалась, что ей плохо.

— Мам?

Она повернулась и сказала: «Я просто запоминаю».

Мы сидели на камнях, ели тёплые пирожки и спорили, кто первым увидел чаек. Поддержать родителей оказалось не только про деньги. Иногда это — заметить их несказанное желание и оставить для него место в собственной жизни.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000026',
    'en',
    'Open Abundance Editorial',
    $$“My mother saw the sea and suddenly went quiet.”

Liza had spent her life saying she needed nothing. A new coat? “The old one is still fine.” A trip? “Don’t spend money on me.” Whenever I asked where she would like to go, Mom answered, “Home is enough.”

I believed her until I found an old postcard of the sea in a drawer. On the back, in her handwriting, it said: “Someday I’ll see it myself.”

In Goals, I did not write “give my mother a trip.” I wrote a concrete wish: spend a week by the sea together. It felt more honest. I did not want a grand surprise that would leave us both exhausted. In Today, I chose one first step: ask which dates actually worked for her.

Mom studied the calendar.

“But you work.”
“That’s why I’m asking early.”

We chose a small town, a direct train, and an apartment with a kitchen. I moved two projects and, for once, did not apologize for taking leave.

On departure day, Mom brought the old postcard. By the sea, she took off her coat, walked to the water, and went silent. I worried something was wrong.

“Mom?”

She turned and said, “I’m just remembering this.”

We sat on the rocks, ate warm pastries, and argued about who spotted the gulls first. Supporting parents is not only about money. Sometimes it means noticing an unspoken wish and making room for it in your own life.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000027',
    'ru',
    'Редакция Open Abundance',
    $$«Первую ночь мы спали на полу. В своей квартире»

Илья с Катей привыкли не привязываться к месту. Чемоданы у двери, чужая мебель, хозяин, который мог написать в любой момент: «Нужно освободить квартиру». Они откладывали на своё жильё, но каждый раз появлялся новый расход.

Когда сорвался очередной вариант, Катя сказала:

— Может, это знак, что не получится?

Илья не нашёлся, что ответить. В тот вечер он открыл Abundance и впервые записал желание не как «когда-нибудь купить квартиру», а как результат: ключи от небольшого дома, где можно оставить книги на полке. В Today добавил шаг — собрать все обязательные расходы за последние три месяца и выбрать сумму, которую они действительно могут откладывать.

Таблица получилась неприятной. Они увидели подписки, спонтанные доставки и привычку помогать всем сразу. Ничего героического: отменили лишнее, договорились о переводе в день зарплаты и завели отдельный конверт на первый взнос. Несколько месяцев цифры почти не двигались. Потом Катя получила дополнительный проект, а Илья взял один вечер в неделю для консультаций.

Они снова приехали смотреть квартиру и нашли на кухне трещину. Раньше испугались бы и ушли. Теперь задали вопросы, пересчитали ремонт и остались.

В первую ночь они спали на полу среди коробок. Пили чай из двух разных кружек и передавали друг другу ключ.

— Его уже не нужно возвращать, — сказала Катя.

Илья улыбнулся. Дом начался не с идеальной сделки, а с решения смотреть на мечту как на маршрут.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000027',
    'en',
    'Open Abundance Editorial',
    $$“We slept on the floor the first night. In our own apartment.”

Ilya and Katya were used to not putting down roots. Suitcases by the door, someone else’s furniture, a landlord who could write at any moment: “The apartment needs to be empty.” They saved for a place of their own, but a new expense always appeared.

When another apartment deal fell through, Katya said, “Maybe it means this will never happen.”

Ilya had no answer. That evening he opened Abundance and wrote the wish as a result instead of a someday plan: keys to a small home where they could leave books on a shelf. In Today, he chose one step — list every expense from the past three months and decide what they could truly save.

The table was uncomfortable. They saw unused subscriptions, impulse deliveries, and the habit of helping everyone at once. Nothing heroic: they cancelled what they did not need, scheduled a transfer for payday, and created a separate envelope for the down payment. For months, the number barely moved. Then Katya took an extra project, and Ilya reserved one evening a week for consulting.

They returned to view another apartment and found a crack in the kitchen. Before, they would have left. This time they asked questions, recalculated the repairs, and stayed.

On the first night, they slept on the floor among boxes. They drank tea from two different mugs and passed the key between them.

“We don’t have to give it back,” Katya said.

The home did not begin with a perfect deal. It began when a dream became a route they could keep walking.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000028',
    'ru',
    'Редакция Open Abundance',
    $$«В сорок три я всё ещё прятала свои рисунки»

Настя хранила рисунки в папке с документами. Если кто-то заходил в комнату, она закрывала её первой. В сорок три года это казалось особенно неловким: взрослый человек, работа, семья — и цветные листы, которые никто не должен увидеть.

— Ты всё ещё рисуешь? — спросил однажды сын.
— Иногда. Это неважно.

Он посмотрел на папку и сказал: «Тогда почему ты улыбаешься, когда рисуешь?»

После этого Настя записала в Goals желание собрать настоящее портфолио. Не стать художницей за месяц и не бросить работу, а перестать прятать то, что возвращает ей силы. В Today поставила маленький шаг: выбрать пять рисунков и показать их одному человеку, которому доверяет.

Первой стала соседка, дизайнер. Настя заранее приготовила объяснение, почему всё это несерьёзно, но соседка перебила:

— Здесь есть твой голос. Давай посмотрим, где его можно услышать ещё.

Они выбрали три работы для открытого альбома. Настя переписала подписи, сфотографировала листы и неделю не решалась нажать «опубликовать». Когда нажала, телефон показал несколько просмотров и один короткий комментарий: «Я тоже снова хочу рисовать».

Заказов не появилось. Зато Настя впервые оставила папку на столе. Через месяц она записалась на вечерний курс, а ещё через два — показала работу на маленькой выставке.

В сорок три она не начала жизнь заново. Она перестала вычёркивать из неё важную часть себя.$$
  ),
  (
    'a1700000-0000-4000-8000-000000000028',
    'en',
    'Open Abundance Editorial',
    $$“At forty-three, I was still hiding my drawings.”

Nastya kept her drawings in a folder with official documents. Whenever someone entered the room, she closed it first. At forty-three, it felt embarrassing: an adult with a job and a family, still making colorful pages nobody was supposed to see.

“Do you still draw?” her son asked one day.
“Sometimes. It doesn’t matter.”

He looked at the folder. “Then why do you smile when you draw?”

After that, Nastya wrote a wish in Goals: build a real portfolio. She did not want to become an artist in a month or quit her job. She wanted to stop hiding what gave her energy. In Today, she chose a small step: select five drawings and show them to one person she trusted.

The first person was a designer who lived next door. Nastya prepared an explanation for why the work was not serious, but the neighbor interrupted.

“There is a voice here. Let’s see where else it can be heard.”

They chose three pieces for a public album. Nastya rewrote the captions, photographed the pages, and spent a week afraid to press publish. When she did, there were a few views and one short comment: “I want to draw again too.”

No commissions arrived. But Nastya left the folder on the table for the first time. A month later she joined an evening course, and two months after that she showed a piece at a small exhibition.

At forty-three, she did not start her life over. She stopped deleting an important part of herself from it.$$
  )
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
values
  (
    'a1700000-0000-4000-8000-000000000024',
    'image',
    '/feed/editorial-stories/front-row.png',
    '{"ru":"Мама в первом ряду школьного утренника замечает взгляд дочери на сцене","en":"A mother in the front row meets her daughter’s eyes at a school performance"}'::jsonb,
    null,
    'OpenAI imagegen',
    0,
    '{"origin":"openai_imagegen","use_case":"illustration-story","aspect_ratio":"4:5","style":"premium polished 3D editorial illustration","generated_at":"2026-09-13"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-000000000025',
    'image',
    '/feed/editorial-stories/first-order.png',
    '{"ru":"Мастерица упаковывает первый заказ за кухонным столом","en":"A maker wraps her first order at a kitchen table"}'::jsonb,
    null,
    'OpenAI imagegen',
    0,
    '{"origin":"openai_imagegen","use_case":"illustration-story","aspect_ratio":"4:5","style":"premium polished 3D editorial illustration","generated_at":"2026-09-13"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-000000000026',
    'image',
    '/feed/editorial-stories/sea-for-mom.png',
    '{"ru":"Дочь и мама стоят у моря во время долгожданной поездки","en":"A daughter and her mother stand by the sea on a long-awaited trip"}'::jsonb,
    null,
    'OpenAI imagegen',
    0,
    '{"origin":"openai_imagegen","use_case":"illustration-story","aspect_ratio":"4:5","style":"premium polished 3D editorial illustration","generated_at":"2026-09-13"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-000000000027',
    'image',
    '/feed/editorial-stories/our-own-key.png',
    '{"ru":"Пара пьёт чай среди коробок в первой собственной квартире","en":"A couple shares tea among boxes in their first home"}'::jsonb,
    null,
    'OpenAI imagegen',
    0,
    '{"origin":"openai_imagegen","use_case":"illustration-story","aspect_ratio":"4:5","style":"premium polished 3D editorial illustration","generated_at":"2026-09-13"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-000000000028',
    'image',
    '/feed/editorial-stories/drawing-again.png',
    '{"ru":"Женщина рисует за столом и готовит портфолио","en":"A woman draws at a desk and prepares a portfolio"}'::jsonb,
    null,
    'OpenAI imagegen',
    0,
    '{"origin":"openai_imagegen","use_case":"illustration-story","aspect_ratio":"4:5","style":"premium polished 3D editorial illustration","generated_at":"2026-09-13"}'::jsonb
  )
on conflict (post_id, sort_order) do update
set
  media_type = excluded.media_type,
  media_url = excluded.media_url,
  alt_text = excluded.alt_text,
  source_url = excluded.source_url,
  source_label = excluded.source_label,
  metadata = excluded.metadata;
