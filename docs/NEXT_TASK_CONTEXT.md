# Open Abundance — контекст для следующего task

Дата: 2026-07-13

## Текущее состояние

- Канонический трекер: `docs/MASTER_KANBAN.md`.
- Единственный активный продуктовый шаг: **Home/Today как главный экран**.
- Единый onboarding вручную принят пользователем и находится в `Подтверждено пользователями`.
- Первая Core-цепочка челленджей также подтверждена пользователем.
- Пилот закрытый: 20–50 русскоязычных пользователей.
- Основной цикл: история → желание → финансовый план → Today → действие/награда → рост → публикация → возврат.
- Wallet/выводы и реферальная монетизация пока не являются текущим шагом.

## Что делать дальше

Home/Today технически реализован по decision-complete плану из `MASTER_KANBAN.md` и `TODAY_DAILY_CHALLENGE_PLAN.md`. Следующий task — Technical QA/User QA и исправление найденных runtime/data blockers; в `Сейчас` по-прежнему остается ровно одна карточка.

Цель Home/Today: пользователь сразу видит своё желание, Core-цель, прогресс Today и одно следующее действие. CTA должен вести к актуальному действию; после выполнения прогресс и CTA должны измениться. Обработать также пользователя без сохранённого плана.

Не входит в шаг: Wallet-ввод/вывод, Wallet-награды, реферальные выплаты, публичная лента, полноценное создание server-side Wish/GrowthPlan из onboarding draft.

## Ключевые файлы

- `docs/MASTER_KANBAN.md` — статус и очередь; обновлять вместе с кодом.
- `docs/PROJECT_MEMORY.md` — накопительный контекст и решения.
- `components/OnboardingApp.tsx` — подтверждённый onboarding.
- `lib/onboardingContent.ts` — тексты onboarding.
- `components/ChallengesApp.tsx` — челленджи, Today и первый Core-путь.
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
- Home является отдельным default `home` main tab; Today popup заменяется встроенным Home-состоянием.
- Home не создает server Wish/GrowthPlan: server plan читается из `/api/today`, fallback — из `profile.onboarding_state.firstPlanDraft`.
- На Home ровно один primary CTA. Его приоритет: Today pending → следующий challenge после completion → calculator при отсутствии server plan → build plan при отсутствии draft.
- Home реализован в `components/HomeTodayApp.tsx`; global Today popup удален из `AppNavigation`; browser QA пока не выполнен из-за недоступного in-app browser.
- Перед кодом прочитать `docs/DEVELOPMENT_RULES.md`.

## Проверки

После frontend-изменений: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test:e2e` (для e2e сразу использовать escalation). После tsc восстановить только incidental `tsconfig.tsbuildinfo` через `git restore tsconfig.tsbuildinfo`. Один раз попытаться выполнить ручную проверку в in-app browser; известная ошибка среды: `sandbox-state-meta`.

## Важное незавершённое

- Onboarding пока сохраняет draft локально и в `profile.onboarding_state`; полноценное создание Wish/GrowthPlan на сервере отдельная задача.
- Для `Reach Today Core Target` добавлена corrective-миграция `supabase/migrations/20260713120000_fix_today_core_target_ru_utf8.sql`; фактические русские поля в Supabase уже исправлены через REST с service role.
