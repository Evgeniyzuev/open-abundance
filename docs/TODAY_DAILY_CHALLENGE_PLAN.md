# Today Daily Challenge Plan

Today - ежедневный персональный челлендж пользователя. Он объединяет чек-ин, личный чек-лист на день, прогресс Core до дневной цели и streak за непрерывное возвращение в систему.

Идея: пользователь не ищет, что делать дальше. При первом входе за день Today автоматически принимается, показывает короткий экран смысла дня и остается в принятых челленджах, где можно проверить чек-лист и прогресс.

## Current Status

2026-06-13: первый технический MVP реализован.

- Добавлены таблицы `user_core_growth_plans`, `user_today_instances`, `user_today_items`, `today_progress_events` с RLS и read-only доступом пользователя к своим данным.
- Добавлен `/api/core/growth-plan`: сохраняет активный сценарий Wallet/Core-калькулятора.
- Добавлен `/api/today`: при первом входе за день создает Today-инстанс со статусом `accepted`, генерирует чек-лист и считает прогресс.
- Добавлен `/api/today/check`: завершает Today, если дневная Core-цель достигнута.
- Wallet/Core calculator сохраняет активный план при расчете срока до цели.
- Challenges screen показывает Today-карточку над обычными челленджами с прогрессом `$current / $target`, streak и чек-листом.
- Текущий app shell показывает Today popup при первом онлайн входе за день и дает быстрый переход в Challenges -> Today; Home/Today integration ниже заменяет этот popup встроенным состоянием Home.
- Миграции `20260613060618_today_daily_challenge_mvp.sql` и `20260613064629_today_core_growth_plan_fk_index.sql` применены к Supabase, наличие таблиц и FK-индекса проверено SQL-запросами.

Осталось: ручная UX-проверка в приложении, затем расширение checklist источниками из local tasks, project tasks и wishes.

### Home/Today integration decision — 2026-07-13

Home/Today становится отдельным default main tab поверх существующего Today MVP.

- Home читает Today из существующего `/api/today` с `no-store`; новый агрегирующий endpoint не нужен.
- Активный server plan берется из `today.plan`. До появления server plan Home показывает onboarding draft из `profile.onboarding_state.firstPlanDraft` как preview и ведет в Wallet/Core calculator.
- Главным желанием считается `firstPlanDraft.mainWish`; полноценное создание server Wish из draft остается отдельной задачей.
- На Home показываются желание, Core-цель, Today progress/status и один primary CTA.
- CTA меняется по состоянию: достичь Today target → открыть следующий рекомендованный challenge → рассчитать plan → собрать plan.
- Для гостя допустим только локальный preview; серверные progress/streak не подменяются локальными значениями.
- После challenge reward или Wallet → Core Home повторно загружает `/api/today` и показывает актуальный progress/CTA.
- Глобальный first-day Today popup удаляется из app shell: его роль выполняет встроенное состояние Home.

### Implemented — 2026-07-13

- Добавлен `components/HomeTodayApp.tsx` и default `home` route в `components/AppNavigation.tsx`.
- Home показывает draft/server wish, Core target, server Today progress/checklist/streak и один динамический CTA.
- CTA открывает Today, следующий рекомендованный challenge или Wallet/Core calculator; draft-параметры передаются в калькулятор.
- Удален глобальный Today popup; состояние первого входа теперь отображается внутри Home.
- Typecheck, lint и HTTP 200 локального app shell прошли. Два Challenges e2e smoke-сценария оставались заблокированы отсутствующим runtime-каталогом (экран `Loading...`), но Home/Today и объединенная Home + AI chat навигация вручную приняты пользователем 2026-07-15.
- 2026-07-15: начисление reward в Core вручную проверено; в `components/ChallengesApp.tsx` добавлен упрощенный UX receipt с challenge, verification, суммой Core и Core после начисления. Ledger ID, финансовая история и server-side изменение личного плана сознательно отложены.
- 2026-07-15: первая версия Goals Growth Map реализована в `components/GrowthMapApp.tsx`; она показывает уровень, ближайшие Core-пороги и привязанные желания, но пока требует отдельного User QA и не добавляет action-loop к Today/challenges.

## Product Goal

Today должен дать полезность в первые 5 секунд:

- показать, сколько Core нужно получить сегодня по личному плану;
- собрать 3-7 конкретных действий на день;
- дать понятный прогресс вида `Today $7 / $10`;
- поддержать streak без ощущения наказания;
- связать ежедневную рутину с Wallet/Core-калькулятором и долгосрочной целью.

## User Flow

1. Пользователь открывает приложение.
2. Сервер определяет локальную дату пользователя и создает Today-инстанс, если его еще нет.
3. Today получает статус `accepted` автоматически.
4. В первый вход за день показывается информационный экран:
   - дневная цель Core;
   - текущий streak;
   - 3-7 задач на сегодня;
   - что засчитывается в прогресс.
5. Позже Today доступен в "Принятых" челленджах и на главном Today/Home экране.
6. Когда дневной Core-прогресс достигает цели, пользователь нажимает "Проверить" или Today завершается автоматически после надежной серверной проверки.

## Completion Rule

Today выполнен, когда за текущий день пользователь получил или добавил в Core сумму не меньше дневного плана из Wallet/Core-калькулятора.

Пример:

```text
Today $7 / $10
```

`$10` - запланированное ежедневное пополнение Core из сохраненного сценария калькулятора.

`$7` - уже засчитанный дневной прогресс Core.

Для MVP прогресс должен считаться только по серверному источнику, без чтения текущего баланса как доказательства. Иначе можно случайно засчитать старый рост, пассивные проценты или повторно одну и ту же операцию.

## What Counts Toward Today

MVP:

- Core rewards from completed challenges;
- Wallet -> Core top-up;
- task rewards, when task rewards become server-backed;
- project task rewards, when project participation loop is implemented.

Separate from MVP / needs explicit decision:

- passive daily Core accrual;
- team bonus;
- external payments/onramp;
- manual admin adjustments.

Recommended default: пассивные проценты и team bonus показывать в Wallet/Core истории, но не засчитывать в Today target. Today должен мотивировать осознанное действие пользователя, а не только ожидание начисления.

## Calculator Dependency

Today target comes from the user's saved Core growth scenario:

- `target_type`: `core_amount` or `daily_income`;
- `target_value`;
- `daily_additions`;
- `reinvest_percent`;
- `calculated_days_to_goal`;
- `saved_at`;
- optional `title`.

If the user has no saved scenario:

- show Today with a setup item: "Рассчитать путь к цели";
- use a soft default target, for example `$1`, only as onboarding;
- do not create pressure to top up before the calculator scenario exists.

The calculator still must not change balances. It only sets the personal plan that Today uses.

## Checklist Sources

Today checklist is not just a hardcoded list. It is a daily projection of useful work:

- local tasks due today;
- active accepted challenges that can progress today;
- one recommended open project task;
- one Wallet/Core action if daily Core target is not reached;
- one social/trust action when relevant;
- one wish/progress action from the user's active wish.

MVP can start with:

- "Check in";
- "Complete one task";
- "Make progress toward daily Core target";
- "Review one accepted challenge";
- "Open Wallet/Core calculator" if no target exists.

Each item should have:

- stable `item_key`;
- `source_type`: `system`, `task`, `challenge`, `wallet`, `project`, `wish`, `social`;
- optional `source_id`;
- `status`: `pending`, `done`, `skipped`;
- optional `completed_at`.

## Streak Model

There are two streaks:

1. Check-in streak - consecutive days when the user opened the app and Today was accepted.
2. Completion streak - consecutive days when Today reached its Core target.

The UI can show both, but the primary motivational streak should be completion streak. Check-in streak is useful for retention analytics and gentle encouragement.

Suggested rules:

- first daily open creates Today and increments check-in streak;
- Today completion increments completion streak;
- streak is based on user's local date/timezone saved on profile;
- use a grace window for travel/timezone edge cases;
- missing a day pauses or resets completion streak, but does not delete history;
- later add "streak protection" or soft lives if this becomes emotionally harsh.

## Time In System Bonus

Time in system can support Today, but it must be capped and meaningful.

Recommended rule:

- count active focused time, not idle browser time;
- cap bonus progress per day, for example 20-30 minutes;
- reward only meaningful activity windows: navigation, completing tasks, reading challenge/project details, using Wallet/Core tools, writing notes;
- do not make raw screen time the main success condition.

MVP can record the field later and keep the first version focused on Core progress and checklist completion.

## Data Model Draft

### `user_core_growth_plans`

Stores the saved calculator scenario used by Today.

Fields:

- `id`;
- `user_id`;
- `target_type`;
- `target_value numeric(30, 12)`;
- `daily_additions numeric(30, 12)`;
- `reinvest_percent numeric(5, 2)`;
- `calculated_days_to_goal integer`;
- `is_active boolean`;
- `created_at`;
- `updated_at`.

### `user_today_instances`

One row per user per local date.

Fields:

- `id`;
- `user_id`;
- `local_date date`;
- `timezone text`;
- `status`: `accepted`, `completed`, `expired`;
- `target_core numeric(30, 12)`;
- `progress_core numeric(30, 12)`;
- `core_growth_plan_id`;
- `first_seen_at`;
- `completed_at`;
- `info_seen_at`;
- unique `(user_id, local_date)`.

### `user_today_items`

Checklist items generated for the daily instance.

Fields:

- `id`;
- `today_instance_id`;
- `item_key`;
- `source_type`;
- `source_id`;
- `title_key` or `title`;
- `status`;
- `sort_order`;
- `completed_at`;
- unique `(today_instance_id, item_key)`.

### `today_progress_events`

Deduplicated ledger of what was counted toward Today.

Fields:

- `id`;
- `today_instance_id`;
- `source_type`;
- `source_id`;
- `amount_core numeric(30, 12)`;
- `created_at`;
- unique `(today_instance_id, source_type, source_id)`.

This can be a materialized/projection layer over `wallet_ledger` and challenge reward history. The important part is deduplication and server authority.

## API Draft

### `GET /api/today`

Auth required. `no-store`.

Responsibilities:

- determine user's local date;
- create `user_today_instances` row if missing;
- auto-accept Today;
- generate missing checklist items;
- aggregate eligible Core progress;
- return Today card, checklist and streak summary.

### `POST /api/today/check`

Auth required.

Responsibilities:

- recompute progress from server sources;
- mark Today completed if `progress_core >= target_core`;
- grant Today completion reward/bonus if enabled;
- update completion streak.

### `POST /api/today/items/[itemId]/complete`

Optional for MVP. Needed only for checklist items that are not already completed by another server source.

## UI Draft

Today/Home screen:

- header with level, Core and streak;
- card `Today $7 / $10`;
- progress bar;
- compact checklist;
- action button for the most important next step;
- link to accepted challenge detail.

Challenges screen:

- Today appears in "Accepted" as a special daily challenge;
- detail view shows the same progress and checklist;
- if Today is completed, show completed state for that local date.

First entry of the day:

- show one focused info screen or modal;
- do not block the app after the user closes it;
- store `info_seen_at` to avoid repeating it that day.

## Anti-Abuse And Accounting

Rules:

- never complete Today from current Core balance alone;
- count only completed, server-written ledger/reward operations;
- deduplicate by source operation id;
- target and timezone are snapshotted when Today is created;
- changing calculator settings affects the next Today, not the current one, unless user explicitly refreshes today's plan before any progress was counted;
- rewards for Today itself must not recursively count toward the same Today.

## Implementation Phases

### Phase 1 - Plan and Source of Truth

- Add this document.
- Decide whether Today counts Wallet -> Core top-up only, challenge rewards only, or both.
- Persist active Core growth calculator scenario.
- Define daily Core progress source in ledger terms.

### Phase 2 - Today MVP Backend

- Add `user_core_growth_plans`.
- Add `user_today_instances`.
- Add `user_today_items`.
- Add `/api/today` with auto-accept on first daily open.
- Add `/api/today/check` with server recomputation.

### Phase 3 - UI MVP

- Add Today card to Home/Today.
- Add first-entry info modal.
- Show Today in accepted challenges.
- Render checklist and `Today $current / $target`.

### Phase 4 - Streaks And Bonus

- Add check-in and completion streak summaries.
- Add capped meaningful active-time tracking if still needed.
- Add small streak bonus rules only after anti-abuse is clear.

### Phase 5 - Rich Checklist

- Pull local tasks due today.
- Pull active challenge next steps.
- Pull open project tasks.
- Pull active wish progress action.
- Add skip/replace logic for irrelevant items.

## Open Questions

1. Should manual Wallet -> Core top-up count toward Today, or only earned rewards?
2. Should passive daily Core income count toward Today? Recommended: no.
3. What is the default target before the user saves a calculator scenario?
4. Do we complete Today automatically when the target is reached, or require a "Проверить" action?
5. How generous should streak protection be?
6. What exact activity qualifies for "time in system" bonus?

## Recommended Next Step

Build the narrow MVP:

1. Save the user's active calculator scenario.
2. Add `/api/today`, which creates today's accepted instance on first open.
3. Count Today progress from challenge rewards and Wallet -> Core ledger rows for the current local date.
4. Show the card `Today $current / $target` plus a simple checklist.

This gives immediate daily usefulness without waiting for the full project-task, wish-action and active-time systems.
