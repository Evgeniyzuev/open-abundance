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
- [ ] Results offer/brochure: Goals -> Results, оффер $1,000,000 Core за 20 уровней, локальная книга-брошюра в инвентаре результата после первого прочтения.
- [ ] Starter challenges: принятие/проверка, reward flow, proof для калькулятора.
- [ ] Compound interest challenge quiz: `calculate_time_to_goal` требует калькуляторный proof + тест 4/5, сохраняет `compound_quiz_passed` в `verification_data`, повторы без ограничения; UI вынесен в reusable `ChallengeQuiz` с пошаговыми вопросами и optional image.
- [ ] Wishes MVP: personal wishes CRUD, recommended -> my wish, фильтрация уже добавленных recommendations, `has_wish` server check.
- [ ] Social feed/blog MVP: public feed, personal blog, daily growth draft, publish/archive/delete, post detail.
- [ ] Daily growth autopost draft: черновик за завершенный период с блоками `level`, `total_core_growth`, `team_strength`, настройка видимости блоков.
- [ ] External social links: inbound external link post, link-only preview, public feed/blog/detail.
- [ ] Referrals/teams foundation: referral code/claim, team membership, team bonus ledger and baseline logic.
- [ ] AI Coordinator MVP: AI chat с knowledge base о проекте, Gemini как основной провайдер, Groq как fallback, streaming ответов, вкладка "Идеи" в навигации.
- [ ] Product docs audit: сверка `Abundance_SYS_CONCEPT` с `OPEN_ABUNDANCE_MASTER_PLAN.md`, ревизия `CHALLENGES_CATALOG.md`, актуализация ближайшего канбана.
- [ ] Starter challenge autochecks: API-проверки для AI proof, профиля, 3 шагов желания, первого поста, реинвестирования, реферала, team contact, skill passport; миграция `20260611152126_challenge_autochecks_catalog.sql`.

## В работе

- [ ] Today screen MVP
  - Первый экран дня, который собирает уже готовые источники в один сценарий.
  - Current Core, level and progress to next level.
  - Today's due tasks and reminders from local-first tasks/notes.
  - Accepted/open starter challenges and the best next check.
  - CTA for yesterday's daily growth draft: create/review/publish if available.
  - Short growth summary: yesterday Core growth, team bonus, streak/task progress where data exists.
  - Empty/loading/offline states.

## Очередь

1. [ ] Starter challenge catalog hardening
   - Реализовано в коде: Personal Value Map, Turn Wish Into 3 Steps, First Growth Story, Enable Reinvestment, Skill Passport, Team Welcome.
   - Реализовано в коде: тест понимания сложного процента для `calculate_time_to_goal`.
   - Осталось вручную проверить UX и тексты в приложении.
   - Не вводить marketplace-челленджи раньше базовой верификации, публичных профилей, Wallet-to-Wallet и подтверждений от участников.

2. [ ] Wallet -> Core transfer
   - Перевод части Wallet в Core.
   - Server-authoritative ledger operation.
   - UI action from Wallet/Core screen.
   - Refresh user context without stale cache.
   - Основа для челленджа `first_wallet_to_core`.

3. [ ] Challenge verification and anti-abuse policy
   - Non-self checks for transfers, team actions and goal funding.
   - Minimum thresholds, `completed` statuses, unique operation IDs and replay protection.
   - Baseline tracking for growth-threshold challenges.
   - Rule: no Wallet challenge rewards for now; reputation waits for a dedicated Trust system.
   - Plan community/manual checks for App Testing, Help Someone Move, goal funding, marketplace deal completion and skill income.
   - Trust/reciprocity roadmap lives in `docs/TRUST_RECIPROCITY_MARKET_PLAN.md`.

4. [ ] Task editing and undo completion
   - Edit existing local task.
   - Undo today's completion.
   - Keep archive/repeat behavior intact.

5. [ ] Daily ledger source for all Core growth
   - Include challenge rewards, task rewards and manual Core top-ups in daily growth without double counting.
   - Feed daily draft should use this source for `total_core_growth`.
   - Required for reliable `core_growth_threshold` challenges.

6. [ ] Wallet-to-Wallet transfer MVP
   - Send Wallet amount to another user.
   - Incoming transfer return/cancel.
   - Ledger and basic confirmation screen.
   - Non-self and completed-status verification for transfer/funding challenges.

7. [ ] Public profile URLs
   - Stable public profile route outside current Social modal.
   - Public avatar/name/level view.
   - Respect visibility settings.
   - Needed before trust, help and marketplace discovery flows become prominent.

8. [ ] Feed interactions MVP
   - Reactions/comments/saves for public feed posts.
   - Keep private stat blocks hidden.
   - Supports First Growth Story and Help Someone Move challenges.

9. [ ] Wishes progress and daily sources
   - Include new/completed public wishes in daily draft sources.
   - Add visible progress toward wish target.
   - Add wish step tracking for `wish_steps_created`.

10. [ ] Skill Passport MVP
    - Profile fields for skills, interests, experience, availability and proof links.
    - Verification for `profile_strengths_filled` and `skill_profile_completed`.
    - Prepares marketplace without launching full marketplace scope.

11. [ ] Trust-lite and reciprocity foundation
   - `trust_events`, `mutual_confirmations`, `reciprocity_balances`.
   - Phase 1 migration created: `20260611161340_trust_reciprocity_foundation.sql`.
   - Phase 2 API foundation created: `lib/trust.ts`, `/api/trust/confirmations`, `/api/trust/confirmations/[confirmationId]/confirm`, `/api/trust/confirmations/[confirmationId]/decline`, `/api/trust/summary`.
   - Mutual confirmations for help, community checks and simple deals.
   - Soft reciprocity signal for recommendations and promotion, without public numeric reputation.
   - Inventory artifacts for confirmed milestones.
   - See `docs/TRUST_RECIPROCITY_MARKET_PLAN.md`.

12. [ ] Afterburn MVP
   - Off by default.
   - One-shot/manual setting that routes part of Wallet to Core before accrual.
   - Limit or non-reducible Wallet remainder.

13. [ ] Marketplace challenge implementation
    - Create offer, complete deal, fund goal and earn from skill.
    - Requires Wallet-to-Wallet, public profiles, basic moderation, Trust-lite, anti-abuse rules and participant confirmations.

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
- Marketplace-челленджи с реальными сделками до Wallet-to-Wallet, публичных профилей, базовой модерации и anti-abuse правил.
- Внешний onramp/реальные пополнения до готовой платежной инфраструктуры.
- Системные Wallet-награды.
- Внутренний Direct beyond very simple MVP.
- Нативные приложения.
- Сложные банковские интеграции, внешний вывод средств, счета, инвойсы, смарт-контракты.
- Vision/Sims full economy.
- AI autonomous/high-risk actions.
