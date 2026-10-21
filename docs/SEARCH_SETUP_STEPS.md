# Поисковики и ИИ-агенты: что сделать руками

Версия 1 · 2026-10-21. Что делает код, описано в [AGENT_ECOSYSTEM_PLAN.md](AGENT_ECOSYSTEM_PLAN.md). Здесь только шаги, которые может сделать владелец аккаунтов. Адрес сайта ниже: `https://open-abundance.vercel.app` (после переезда на свой домен повторить шаги 2–4 для нового адреса).

Время: около 40 минут в сумме. После шагов эффект появляется не сразу: поисковикам нужны дни и недели.

## Шаг 0. Дождаться деплоя

1. Vercel → проект → Deployments: последний деплой из `main` в статусе Ready.
2. Открыть в браузере и убедиться, что страницы открываются:
   - `https://open-abundance.vercel.app/en/guide`
   - `https://open-abundance.vercel.app/en/guide/open-abundance-for-ai-assistants`
   - `https://open-abundance.vercel.app/robots.txt` (должны быть перечислены боты)
   - `https://open-abundance.vercel.app/sitemap.xml` (около 36 адресов)
   - `https://open-abundance.vercel.app/llms.txt` и `/llms-full.txt`
3. Открыть любую английскую страницу, нажать «Start free» и убедиться, что открывается онбординг, а в адресе есть `utm_source=answers`.

## Шаг 1. Применить миграции прошлых задач

Миграции этой задачи не требовались. Если ещё не применены миграции из прошлых задач (например `20261019200000` для челленджей создателей и `20261020150000` для ценностей), применить их в Supabase (SQL Editor или `supabase db push`).

## Шаг 2. Google Search Console

1. Открыть https://search.google.com/search-console, войти аккаунтом владельца.
2. Add property → URL prefix → `https://open-abundance.vercel.app/`.
3. Подтверждение: выбрать «HTML tag», скопировать значение `content` из мета-тега `google-site-verification`. В Vercel → Settings → Environment Variables добавить `GOOGLE_SITE_VERIFICATION` со значением `content` (без кавычек), сделать Redeploy. После деплоя нажать Verify.
   - Если подтверждали через DNS (для своего домена) мета-тег не нужен.
4. Sitemaps → Add new sitemap → `sitemap.xml` → Submit. Статус должен стать Success.
5. URL inspection → вставить `https://open-abundance.vercel.app/en/guide/open-abundance-for-ai-assistants` → Request indexing. Повторить для `/en/guide` и главной. Лимит около 10 запросов в день, начать с самых важных.

## Шаг 3. Bing Webmaster Tools (важно для ChatGPT и Copilot)

1. Открыть https://www.bing.com/webmasters, войти.
2. Самый быстрый способ: Import from Google Search Console (после шага 2) переносит сайт и sitemap одним нажатием.
3. Без импорта: Add site → ввести адрес → подтвердить через мета-тег `msvalidate.01` (значение в Vercel Environment Variables как `BING_SITE_VERIFICATION`, затем Redeploy).
4. Sitemaps → Submit sitemap → `https://open-abundance.vercel.app/sitemap.xml`.
5. Settings → AI Performance или аналогичный отчёт (название в интерфейсе меняется): там со временем видно, цитируют ли нас в ответах Copilot.

## Шаг 4. Яндекс Вебмастер (для русскоязычных запросов и Алисы)

1. Открыть https://webmaster.yandex.ru, добавить сайт `https://open-abundance.vercel.app`.
2. Подтверждение мета-тегом `yandex-verification` (значение в Vercel Environment Variables как `YANDEX_SITE_VERIFICATION`, затем Redeploy).
3. Индексирование → Файлы Sitemap → добавить `https://open-abundance.vercel.app/sitemap.xml`.
4. Индексирование → Переобход страниц → отправить главную, `/guide`, `/guide/chto-takoe-open-abundance`.
5. Если сайт из России открывается плохо, это ограничит индексацию Яндексом: см. [RUSSIA_ACCESS_PLAN.md](RUSSIA_ACCESS_PLAN.md).

## Шаг 5. IndexNow (мгновенное уведомление Bing, Яндекса и других)

Файл с ключом уже лежит в `public/2fb07cdd4549735eacc676d55773dfea.txt` и появится на сайте после деплоя. Проверить: открыть `https://open-abundance.vercel.app/2fb07cdd4549735eacc676d55773dfea.txt`, там должен быть тот же ключ.

Отправка адресов (у себя в терминале, из папки проекта):

```
node scripts/indexnow-submit.mjs
```

Ответ 200 или 202 значит, что адреса приняты. Запускать после каждой публикации новых страниц (новые гайды, новые объявления).

## Шаг 6. Первые внешние упоминания (ускоряют доверие)

Модели и поисковики доверяют тому, что упоминается в нескольких местах. Достаточно 3–5 живых ссылок:

1. GitHub: в описании репозитория и README добавить ссылку на сайт и на `/en/guide`.
2. Telegram-канал / чат проекта: пост со ссылкой на 2–3 английских ответа и на русские.
3. Один текст на vc.ru / Habr / dev.to / Medium: «Открытый эксперимент: ИИ-координатор и взаимопомощь», со ссылками на страницы-ответы.
4. Профили в соцсетях: ссылка на сайт в описании.
5. Проверить фильтр: в текстах не писать «гарантированный доход» и процентов в день.

## Шаг 7. Проверка через 2–4 недели

1. Google Search Console → Pages: сколько страниц в индексе, нет ли ошибок. Performance: по каким запросам нас показывают.
2. Bing Webmaster → Search Performance.
3. Яндекс Вебмастер → Индексирование → Страницы в поиске.
4. Спросить ChatGPT (с поиском), Claude (с поиском), Perplexity, Gemini, Алису 10–30 вопросов, например:
   - «как найти первых клиентов на свою услугу»
   - «как начать малый бизнес без денег»
   - «где найти единомышленников для проекта»
   - «как обменяться услугами без денег»
   - «Open Abundance что это»
   Записать, цитируют ли нас, и какие вопросы приводят ссылку. Это метрика «видят ли нас агенты».
5. В аналитике продукта смотреть источники `utm_source=answers`, `ai_assistant`, `listing` и что люди делают после регистрации.

## Если что-то пошло не так

- Страница не индексируется: в Search Console URL inspection покажет причину (чаще всего «Discovered, currently not indexed»: нужно время и внешние ссылки).
- Мета-тег подтверждения не находится: убедиться, что деплой завершён и тег виден в «Просмотр кода страницы» главной.
- IndexNow отвечает 403: ключ в файле не совпал с ключом в скрипте, проверить адрес файла с ключом.
