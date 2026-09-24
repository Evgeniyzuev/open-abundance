-- Add the next set of localized recommendation templates.
-- Keep fixed ids so this catalog seed is safe to re-run in every environment.
insert into public.recommended_wishes (
  id,
  title,
  description,
  image_url,
  category,
  estimated_cost,
  difficulty_level
)
values
  (
    'b9100000-0000-4000-8000-000000000001'::uuid,
    '{"en":"Build $1,000,000 in assets","ru":"Достичь $1 000 000 в активах"}'::jsonb,
    '{"en":"Build a diversified portfolio of assets worth $1,000,000.","ru":"Создать диверсифицированный капитал общей стоимостью $1 000 000."}'::jsonb,
    'https://www.axis.bank.in/images/default-source/blogsimages/what-is-personal-finance3c8bf1a0dfe9491c9f3f8437c7247649.jpg',
    'Finance',
    '$1,000,000',
    20
  ),
  (
    'b9100000-0000-4000-8000-000000000002'::uuid,
    '{"en":"Move to a new home","ru":"Сменить жильё / переехать"}'::jsonb,
    '{"en":"Find a place that feels right and complete the move.","ru":"Найти комфортное место для жизни и организовать переезд."}'::jsonb,
    'https://i.pinimg.com/736x/bd/87/3c/bd873cdad88d686d7399ee1875284a37.jpg',
    'Home',
    '$10,000',
    16
  ),
  (
    'b9100000-0000-4000-8000-000000000003'::uuid,
    '{"en":"Build an emergency fund","ru":"Создать финансовую подушку"}'::jsonb,
    '{"en":"Save enough to cover six months of essential expenses.","ru":"Накопить резерв на шесть месяцев обязательных расходов."}'::jsonb,
    'https://i.pinimg.com/736x/ba/e7/fe/bae7febd333496f102fc9b293cc16745.jpg',
    'Finance',
    '$10,000',
    15
  ),
  (
    'b9100000-0000-4000-8000-000000000004'::uuid,
    '{"en":"Find work I love","ru":"Найти работу по душе"}'::jsonb,
    '{"en":"Move into work that offers meaning, growth, and a good income.","ru":"Перейти к работе, которая даёт смысл, рост и достойный доход."}'::jsonb,
    'https://i.pinimg.com/736x/25/69/bd/2569bdd07905633e793d168a3373ef61.jpg',
    'Career',
    '$5,000',
    15
  ),
  (
    'b9100000-0000-4000-8000-000000000005'::uuid,
    '{"en":"Start my own business","ru":"Открыть своё дело"}'::jsonb,
    '{"en":"Launch a sustainable business with recurring customers and revenue.","ru":"Запустить устойчивое дело с регулярными клиентами и выручкой."}'::jsonb,
    'https://i.pinimg.com/736x/2e/7e/1f/2e7e1fe6ca60c673fb9f610fb517103d.jpg',
    'Business',
    '$25,000',
    18
  ),
  (
    'b9100000-0000-4000-8000-000000000006'::uuid,
    '{"en":"Start a family","ru":"Создать семью"}'::jsonb,
    '{"en":"Build a loving partnership and start a family where we can grow together.","ru":"Построить близкие отношения и семью, в которой хочется расти вместе."}'::jsonb,
    'https://i.pinimg.com/736x/df/26/eb/df26eb53b86f3ad7e139010e32599a00.jpg',
    'Relations',
    null,
    17
  ),
  (
    'b9100000-0000-4000-8000-000000000007'::uuid,
    '{"en":"Travel around the world","ru":"Отправиться в кругосветное путешествие"}'::jsonb,
    '{"en":"Plan a long journey and experience different countries and cultures.","ru":"Спланировать большое путешествие и увидеть разные страны и культуры."}'::jsonb,
    'https://i.pinimg.com/1200x/ec/92/7e/ec927e592be3152780053fd3bc3c13b5.jpg',
    'Travel',
    '$50,000',
    18
  ),
  (
    'b9100000-0000-4000-8000-000000000008'::uuid,
    '{"en":"Support my parents financially","ru":"Поддерживать родителей финансово"}'::jsonb,
    '{"en":"Build a stable way to help my parents with important expenses.","ru":"Создать стабильную возможность помогать родителям с важными расходами."}'::jsonb,
    'https://dynamicassets.am.pictet.com/is/image/pictetasset/Seniors_AdultChildren_GettyImages-1171931332-1%3Aimage-3-2?dpr=on%2C2.625&fit=constrain&ts=1721826024696&wid=2500',
    'Relations',
    '$20,000',
    17
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  category = excluded.category,
  estimated_cost = excluded.estimated_cost,
  difficulty_level = excluded.difficulty_level;
