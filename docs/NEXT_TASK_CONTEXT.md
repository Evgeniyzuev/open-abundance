# Open Abundance — контекст для следующего task

Дата: 2026-07-15

## Текущее состояние

- Канонический трекер: `docs/MASTER_KANBAN.md`.
- Единственный активный продуктовый шаг: **Verified Reality Feed**.
- Home/Today и объединение Home с AI chat вручную подтверждены пользователем и находятся в `Подтверждено пользователями`.
- Награды за завершенные challenges в Core и MVP receipt вручную проверены; полноценный ledger/финансовый receipt отложен до финансового этапа.
- Стартовый маршрут возвращен на `Goals → Notes`: Notes local-first и доступны без сети; Home остается отдельной вкладкой, а не offline-first стартом.
- Первая версия Goals Growth Map технически реализована и требует отдельного User QA; сейчас это карта ориентации, не action-loop.
- Единый onboarding вручную принят пользователем и находится в `Подтверждено пользователями`.
- Первая Core-цепочка челленджей также подтверждена пользователем.
- Пилот закрытый: 20–50 русскоязычных пользователей.
- Основной цикл: история → желание → финансовый план → Today → действие/награда → рост → публикация → возврат.
- Wallet/выводы и реферальная монетизация пока не являются текущим шагом.

## Что делать дальше

Home/Today и MVP receipt закрыты пользователем в канбане. Следующий task — Verified Reality Feed; в `Сейчас` по-прежнему остается ровно одна карточка.

Цель следующего шага: в `People → Feed` пользователь видит verified карточку реального результата `Challenge Done`, отличает ее от `Демо` и ручного контента и может перейти к следующему challenge/Today.

Не входит в шаг: reward amount и ledger/финансовая история, Wallet-ввод/вывод, Wallet-награды, реферальные выплаты, рекомендации, сложный social graph, изменение server-side GrowthPlan и полноценное создание server-side Wish/GrowthPlan из onboarding draft.

## Ключевые файлы

- `docs/MASTER_KANBAN.md` — статус и очередь; обновлять вместе с кодом.
- `docs/PROJECT_MEMORY.md` — накопительный контекст и решения.
- `components/OnboardingApp.tsx` — подтверждённый onboarding.
- `lib/onboardingContent.ts` — тексты onboarding.
- `components/ChallengesApp.tsx` — челленджи, Today и первый Core-путь.
- `components/GrowthMapApp.tsx` — первая карта роста в Goals; текущий статус — технически реализовано, нужен User QA.
- `components/SocialApp.tsx` и `app/api/social/feed/route.ts` — текущий feed-фундамент для Verified Reality Feed.
- `docs/FEED_POSTING_RECOMMENDATIONS_PLAN.md` — продуктовые решения по verified snapshots и системным автопостам.
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
