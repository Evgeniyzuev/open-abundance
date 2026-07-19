# Open Abundance — контекст для следующего task

Дата: 2026-07-19

## Текущее состояние

- Канонический трекер: `docs/MASTER_KANBAN.md`.
- Единственный активный продуктовый шаг: **Verified Reality Feed**.
- Home/Today и объединение Home с AI chat вручную подтверждены пользователем и находятся в `Подтверждено пользователями`.
- Награды за завершенные challenges в Core и MVP receipt вручную проверены; полноценный ledger/финансовый receipt отложен до финансового этапа.
- Стартовый маршрут возвращен на `Goals → Notes`: Notes local-first и доступны без сети; Home остается отдельной вкладкой, а не offline-first стартом.
- Reality Feed demo slice реализован server-backed: 23 fictional demo stories хранятся как обычные `feed_posts`; 10 согласованных историй обновлены 2026-07-19 с RU/EN-локализацией, media и бейджем `Демо-история`.
- Системная серия применена к Supabase: 12 глав от аккаунта `Abundance System`, фиксированный порядок `1–12`, отдельный `system_story` type/badge, системный аватар, RU/EN-тексты и 12 изображений 4:5. Это объяснение позиции Abundance, а не testimonial или verified research; отдельный экран системного профиля еще не реализован.
- Для следующих версий demo-историй принят narrative direction: боль и тупик → случайное знакомство с Abundance → проба из любопытства → маленькие действия → постепенное осознание личной способности менять жизнь → более простая, свободная и осмысленная повседневность. Это fictional inspiration, не testimonial и не гарантия дохода.
- Десять конкретных RU-постов из `docs/REALITY_FEED_DEMO_STORIES_NARRATIVE_DRAFT.md` применены к существующим demo rows по стабильным `source_key`; в финалах сохранены ненавязчивые CTA без обещаний дохода.
- Первая версия Goals Growth Map технически реализована и требует отдельного User QA; сейчас это карта ориентации, не action-loop.
- Единый onboarding вручную принят пользователем и находится в `Подтверждено пользователями`.
- Первая Core-цепочка челленджей также подтверждена пользователем.
- Пилот закрытый: 20–50 русскоязычных пользователей.
- Основной цикл: история → желание → финансовый план → Today → действие/награда → рост → публикация → возврат.
- Wallet/выводы и реферальная монетизация пока не являются текущим шагом.

## Что делать дальше

Home/Today и MVP receipt закрыты пользователем в канбане. Внутри текущего Verified Reality Feed следующий UI-срез — профиль `Abundance System` с ordered chapters и возвратом в ленту; после него отдельным серверным срезом остается real verified `Challenge Done`. В `Сейчас` по-прежнему одна карточка.

Цель следующего UI-шага: из системной карточки открыть профиль `Abundance System`, читать 12 глав по порядку и вернуться в прежнюю позицию ленты. Verified `Challenge Done` остается отдельным server-backed срезом и ведет к challenge/Today.

Не входит в шаг: reward amount и ledger/финансовая история, Wallet-ввод/вывод, Wallet-награды, реферальные выплаты, рекомендации, сложный social graph, изменение server-side GrowthPlan и полноценное создание server-side Wish/GrowthPlan из onboarding draft.

## Ключевые файлы

- `docs/MASTER_KANBAN.md` — статус и очередь; обновлять вместе с кодом.
- `docs/PROJECT_MEMORY.md` — накопительный контекст и решения.
- `components/OnboardingApp.tsx` — подтверждённый onboarding.
- `lib/onboardingContent.ts` — тексты onboarding.
- `components/ChallengesApp.tsx` — челленджи, Today и первый Core-путь.
- `components/GrowthMapApp.tsx` — первая карта роста в Goals; текущий статус — технически реализовано, нужен User QA.
- `components/SocialApp.tsx`, `app/api/social/feed/route.ts`, migrations `20260715120000_reality_feed_demo_posts.sql` и `20260719123000_reality_feed_updated_demo_and_system_stories.sql` — текущий feed/media/localization/system-story фундамент.
- `docs/FEED_POSTING_RECOMMENDATIONS_PLAN.md` — продуктовые решения по verified snapshots и системным автопостам.
- `docs/REALITY_FEED_SYSTEM_STORIES_PLAN.md` — реализованный content/data-план системного аккаунта и 12 глав; отдельный профиль остается pending.
- `lib/serverToday.ts` — server-side Today items/progress.
- `app/api/user/context/route.ts` и `app/api/challenges/route.ts` — актуальные server-backed данные.
- `tests/e2e/app-smoke.spec.ts` — smoke/e2e гостевого onboarding и app shell.
- `docs/CHALLENGES_CATALOG.md` — решения по челленджам.

## Рабочие правила

- Одновременно активна только одна главная карточка.
- Код без ручного UX не считается подтверждённым.
- Статусы: `Очередь → Сейчас → Technical QA → User QA → Подтверждено`.
- Не вводить линейную блокировку челленджей: порядок рекомендательный, ограничения только требованиями/уровнем.
- Server-backed GET должен быть no-store/dynamic; не лечить stale data таймерами до проверки cache headers.
- Default navigation — `Goals → Notes` для offline-first старта; Home остается отдельным `home` main tab, а Today popup заменен встроенным Home-состоянием.
- Home не создает server Wish/GrowthPlan: server plan читается из `/api/today`, fallback — из `profile.onboarding_state.firstPlanDraft`.
- На Home ровно один primary CTA. Его приоритет: Today pending → следующий challenge после completion → calculator при отсутствии server plan → build plan при отсутствии draft.
- Home реализован в `components/HomeTodayApp.tsx`; global Today popup удален из `AppNavigation`; Home и AI chat объединены в одну навигационную группу и вручную приняты пользователем. Стартовый маршрут переключен обратно на `Goals → Notes`.
- Перед кодом прочитать `docs/DEVELOPMENT_RULES.md`.

## Проверки

После frontend-изменений: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test:e2e` (для e2e сразу использовать escalation). После tsc восстановить только incidental `tsconfig.tsbuildinfo` через `git restore tsconfig.tsbuildinfo`. Один раз попытаться выполнить ручную проверку в in-app browser; известная ошибка среды: `sandbox-state-meta`.

## Важное незавершённое

- Onboarding пока сохраняет draft локально и в `profile.onboarding_state`; полноценное создание Wish/GrowthPlan на сервере отдельная задача.
- Для `Reach Today Core Target` добавлена corrective-миграция `supabase/migrations/20260713120000_fix_today_core_target_ru_utf8.sql`; фактические русские поля в Supabase уже исправлены через REST с service role.
