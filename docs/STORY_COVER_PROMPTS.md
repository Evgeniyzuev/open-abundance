# Промпты для обложек редакционных историй

Для восьми историй из миграции `20261006160000_editorial_stories_pilot_pack.sql`. Стиль: реалистичное фото, снятое на iPhone. Формат 4:5 (вертикальный), PNG или JPG до 500 КБ после оптимизации.

Файлы класть в `public/feed/editorial-stories/` под указанными именами. После этого нужна миграция, привязывающая файлы к историям (`feed_post_media`, по образцу `20260913184341_editorial_stories.sql`).

## Общий блок (добавлять в конец каждого промпта)

```text
Shot on iPhone 15 Pro main camera, natural available light, candid unposed moment, slight natural grain, shallow depth of field, realistic skin and fabric textures, true-to-life colors, no filters. Vertical 4:5 composition with calm empty space in the lower third. No text, no logos, no watermarks, no visible phone screens with readable content, no brand names. Faces turned away, partly in profile or out of focus.
```

## Промпты

### 1. `what-is-easy.jpg` — «Что тебе даётся легко?»

```text
A woman in her thirties sitting at a kitchen table in the evening, laptop open to a document with a red pen and a printed page marked with corrections beside it, a cup of tea, warm lamp light, she is thinking with her chin on her hand, looking at the window.
```

### 2. `first-listing.jpg` — Первое объявление

```text
Close-up of a person's hands holding a smartphone over a wooden desk with a small notebook with handwritten price notes, a coffee mug and a plant, early evening window light, the thumb about to press a button on the phone screen, screen content not readable.
```

### 3. `one-dollar-a-day.jpg` — Подушка с одного доллара в день

```text
A small glass jar with a handful of coins and a few folded bills on a kitchen counter next to a notebook with a simple handwritten checklist, a man's hand placing one coin into the jar, soft morning light, cozy apartment background out of focus.
```

### 4. `three-steps-to-move.jpg` — Переезд в три шага

```text
A couple seen from behind at a kitchen table with a paper map of a city and three sticky notes on it, a laptop and two mugs, a few cardboard boxes in the background, warm afternoon light, relaxed and hopeful mood.
```

### 5. `route-by-steps.jpg` — Поездка по шагам

```text
A desk by a window with an open paper atlas, a passport, a small calendar with circled dates and a laptop showing a blurred map, a backpack leaning against the chair, late-afternoon golden light, a person's hand writing in a notebook.
```

### 6. `first-thousand-lesson.jpg` — Сложный процент на себе

```text
A man sitting on a sofa in the evening with a laptop on his knees, a notebook beside him with a hand-drawn curve rising upward on a graph, a mug on the armrest, soft lamp light, thoughtful relaxed expression, partly turned away from the camera.
```

### 7. `coming-back.jpg` — Возвращение после перерыва

```text
A woman standing by a window on a quiet Sunday evening holding her phone, sunset light on her face seen in profile, a cup of tea on the windowsill, a made bed and a plant behind her, calm and slightly relieved atmosphere.
```

### 8. `neighbour-and-phone.jpg` — Помощь соседу с телефоном

```text
In a bright apartment hallway, a young man and an older neighbour in his sixties sit side by side on a bench looking at a smartphone together, the young man pointing at the screen, friendly relaxed mood, daylight from a stairwell window, screen content not readable.
```

## Что учесть

- Это иллюстрации к редакционным рассказам, а не фотографии реальных участников. Подпись «Редакция Open Abundance» уже стоит у историй.
- Люди на кадрах не должны быть узнаваемы и не должны напоминать реальных известных людей.
- Перед загрузкой проверить, что на кадрах нет читаемого текста, чужих брендов и искажённых рук.
