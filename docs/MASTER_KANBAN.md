# Open Abundance Master Kanban

Этот документ - живой статус разработки. `OPEN_ABUNDANCE_MASTER_PLAN.md` остается продуктовым мастер-планом, а текущие статусы, приоритеты и следующие задачи ведутся здесь.

## Правила

- В работе одновременно один главный пункт.
- В `Готово / принято` пункт попадает после ручной проверки пользователем.
- Если фича реализована технически, но пользователь еще не подтвердил UX, она остается в `Реализовано / проверить`.
- Новые найденные задачи добавляются в `Очередь`, а не смешиваются с текущей работой.
- После frontend-изменений Codex пробует in-app browser один раз; если `iab` недоступен, фиксирует это и запускает доступные технические проверки.

## Готово / принято

- [x] Offline Notes Pilot: PWA-экран заметок, локальный кэш, offline-создание заметки, синхронизация после восстановления связи, деплой на Vercel.

## Реализовано / проверить

- [ ] PWA foundation: `manifest.webmanifest`, service worker, регистрация service worker.
- [ ] Local-first IndexedDB foundation: notes, lists, tasks, task completions, guest identity в общей базе `open-abundance-offline`.
- [ ] Tasks/Streaks MVP: локальные задачи, Today/Other, schedule, finite/infinite streaks, subtasks, image upload, archive, repeat, soft mode, lives.
- [ ] Core/Wallet base: серверные Core и Wallet, история Wallet/Core, daily Core accrual history.
- [ ] Levels: уровень и следующий порог считаются из Core/DB и показываются в Core UI.
- [ ] Reinvest control: настройка `reinvest_percent` 0-100%, сохранение через API, split Core/Wallet.
- [ ] Growth calculator: Future amount, Time to goal, Core-vs-markets chart, методика через `i` modal.
- [ ] Starter challenges: принятие/проверка, reward flow, proof для калькулятора.
- [ ] Wishes MVP: personal wishes CRUD, recommended -> my wish, фильтрация уже добавленных recommendations, `has_wish` server check.
- [ ] Social feed/blog MVP: public feed, personal blog, daily growth draft, publish/archive/delete, post detail.
- [ ] Daily growth autopost draft: черновик за завершенный период с блоками `level`, `total_core_growth`, `team_strength`, настройка видимости блоков.
- [ ] External social links: inbound external link post, link-only preview, public feed/blog/detail.
- [ ] Referrals/teams foundation: referral code/claim, team membership, team bonus ledger and baseline logic.

## В работе

- [ ] Актуализировать документацию статусов: вынести канбан из `OPEN_ABUNDANCE_MASTER_PLAN.md` в `docs/MASTER_KANBAN.md` и зафиксировать ближайшие задачи.

## Очередь

1. [ ] Wallet -> Core transfer
   - Перевод части Wallet в Core.
   - Server-authoritative ledger operation.
   - UI action from Wallet/Core screen.
   - Refresh user context without stale cache.

2. [ ] Today screen MVP
   - Первый экран дня, который собирает уже готовые источники в один сценарий.
   - Current Core, level and progress to next level.
   - Today's due tasks and reminders from local-first tasks/notes.
   - Accepted/open starter challenges and the best next check.
   - CTA for yesterday's daily growth draft: create/review/publish if available.
   - Short growth summary: yesterday Core growth, team bonus, streak/task progress where data exists.
   - Empty/loading/offline states.

3. [ ] Task editing and undo completion
   - Edit existing local task.
   - Undo today's completion.
   - Keep archive/repeat behavior intact.

4. [ ] Daily ledger source for all Core growth
   - Include challenge rewards, task rewards and manual Core top-ups in daily growth without double counting.
   - Feed daily draft should use this source for `total_core_growth`.

5. [ ] Wallet-to-Wallet transfer MVP
   - Send Wallet amount to another user.
   - Incoming transfer return/cancel.
   - Ledger and basic confirmation screen.

6. [ ] Afterburn MVP
   - Off by default.
   - One-shot/manual setting that routes part of Wallet to Core before accrual.
   - Limit or non-reducible Wallet remainder.

7. [ ] Public profile URLs
   - Stable public profile route outside current Social modal.
   - Public avatar/name/level view.
   - Respect visibility settings.

8. [ ] Feed interactions MVP
   - Reactions/comments/saves for public feed posts.
   - Keep private stat blocks hidden.

9. [ ] Wishes progress and daily sources
   - Include new/completed public wishes in daily draft sources.
   - Add visible progress toward wish target.

10. [ ] AI Coordinator MVP planning
    - Decide provider/bring-your-own-key approach.
    - Define first low-risk recommendations.
    - Connect help buttons to AI context later.

## Today Screen MVP: что еще осталось

Автопостинг результатов за вчера уже закрывает социальный output: пользователь может собрать и опубликовать daily growth draft в ленту. Но `Today screen MVP` - это не постинг, а утренний/ежедневный вход в продукт.

Осталось реализовать:

- Единый первый экран после входа: "что у меня сейчас и что делать дальше".
- Блок текущего состояния: Core, Wallet summary, уровень, прогресс до следующего уровня.
- Блок действий на сегодня: due tasks, reminders, accepted challenges, быстрый check/Done.
- Блок вчерашнего результата: если есть данные за завершенный период, предложить открыть daily draft или создать его.
- Блок следующего роста: ближайший уровень, рекомендованное действие, возможно ссылка на Growth calculator.
- Offline/loading/empty states: Today должен быть полезен даже когда серверные Social/Wallet данные временно недоступны.

## Отложено

- Полный marketplace пользовательских заданий.
- Внутренний Direct beyond very simple MVP.
- Нативные приложения.
- Сложные банковские интеграции, внешний вывод средств, счета, инвойсы, смарт-контракты.
- Vision/Sims full economy.
- AI autonomous/high-risk actions.
