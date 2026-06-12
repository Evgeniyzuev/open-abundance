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
- [ ] Core/Wallet base: серверные Core и Wallet, история Wallet/Core, daily Core accrual history, Wallet -> Core top-up через `/api/core/topup` и Wallet/Core UI; top-up теперь идет через atomic `wallet_core_topup` RPC и пишет `wallet_ledger`.
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
- [ ] Trust challenge checks: `trust_event_confirmed:*` in `/api/challenges/check`; migrations `20260612031017_trust_challenge_integration.sql` and `20260612031254_trust_fk_indexes.sql`.
- [ ] Marketplace Phase 1 DB foundation: `user_artifacts` and `wallet_ledger` with RLS, grants, indexes and generated Supabase types; migrations `20260612072754_marketplace_phase1_ownership_ledger.sql` and `20260612073116_wallet_ledger_counterparty_index.sql`.
- [ ] First Wallet -> Core challenge: `wallet_core_topup` RPC, `/api/core/topup` ledger write, `/api/challenges/check` case `first_wallet_to_core`, migration `20260612082405_first_wallet_to_core_challenge.sql`.
- [ ] Wallet-to-Wallet transfer MVP: `wallet_transfer` RPC, `/api/wallet/transfer`, debit/credit `wallet_ledger` rows, Wallet transfer modal, `/api/challenges/check` case `first_wallet_transfer`, migration `20260612101807_first_wallet_transfer_challenge.sql`.
- [ ] Marketplace listings Phase 2: `marketplace_listings`, `/api/marketplace/listings`, `/api/marketplace/listings/[listingId]/cancel`, Wallet -> Market tab, listing grid and sell item modal.

## В работе

- [ ] Marketplace escrow / item sales MVP
  - Phase 1 DB foundation готов: `user_artifacts`, `wallet_ledger`, RLS, indexes, generated types.
  - Wallet -> Core уже переведен на atomic ledger RPC.
  - Wallet-to-Wallet transfer MVP технически готов: backend + modal.
  - Phase 2 listings готов: table/API/create/list/cancel/Market tab.
  - Следующий шаг: marketplace deals + escrow.
  - Условия сделки должны быть явными, версионированными и принятыми обеими сторонами.
  - После принятия актуальных условий обеими сторонами деньги и предмет переходят атомарно на сервере.
  - План: `docs/MARKETPLACE_ESCROW_PLAN.md`.

## Очередь

1. [ ] Starter challenge catalog hardening
   - Реализовано в коде: Personal Value Map, Turn Wish Into 3 Steps, First Growth Story, Enable Reinvestment, Skill Passport, Team Welcome.
   - Реализовано в коде: тест понимания сложного процента для `calculate_time_to_goal`.
   - Осталось вручную проверить UX и тексты в приложении.
   - Не вводить marketplace-челленджи раньше базовой верификации, публичных профилей, Wallet-to-Wallet и подтверждений от участников.

2. [ ] First Wallet -> Core challenge verification
   - Сам Wallet -> Core top-up уже реализован через `/api/core/topup` и UI Wallet/Core.
   - Реализовано в коде: reliable `wallet_ledger` source marker и transactional `wallet_core_topup` RPC.
   - Реализовано в коде: `/api/challenges/check` проверяет завершенную серверную ledger-операцию, а не текущий баланс.
   - Осталось вручную проверить UX прохождения челленджа в приложении.

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
   - Реализовано backend: `wallet_transfer` RPC, `/api/wallet/transfer`, non-self, balance check, debit/credit ledger.
   - Реализовано backend: автопроверка `first_wallet_transfer` по `wallet_ledger`.
   - Реализовано UI: Wallet transfer modal with contacts, manual recipient user id fallback, amount, confirm, refresh.
   - Осталось: incoming display/return/cancel UX.
   - Non-self and completed-status verification for funding challenges still needs wish/source linkage.

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
   - Phase 2 UX foundation created in `Social/Profile`: incoming/outgoing confirmations, confirm/decline actions, contact confirmation request from Contacts.
   - Supabase migrations applied, generated types include Trust tables, Trust challenge verification supports `trust_event_confirmed:*`.
   - Mutual confirmations for help, community checks and simple deals.
   - Soft reciprocity signal for recommendations and promotion, without public numeric reputation.
   - Inventory artifacts for confirmed milestones.
   - See `docs/TRUST_RECIPROCITY_MARKET_PLAN.md`.

12. [ ] Afterburn MVP
   - Off by default.
   - One-shot/manual setting that routes part of Wallet to Core before accrual.
   - Limit or non-reducible Wallet remainder.

13. [ ] Marketplace escrow / item sales implementation
    - Реализовано: объявления о продаже предметов, API create/list/cancel, первая Wallet -> Market сетка.
    - Далее: явные условия сделки, принятие обеими сторонами.
    - Оплата из Wallet; при совпадении принятых условий деньги и предмет переходят атомарно.
    - Requires item ownership, Wallet ledger/escrow, public profiles, basic moderation, Trust-lite and anti-abuse rules.
    - Plan: `docs/MARKETPLACE_ESCROW_PLAN.md`.

## Отложено

- Полный marketplace пользовательских заданий.
- Marketplace-челленджи с реальными сделками до Wallet-to-Wallet, публичных профилей, базовой модерации и anti-abuse правил.
- Today screen как отдельный первый экран: отложен, потому что Core, Wallet, задачи, челленджи и Social уже доступны в своих разделах.
- Внешний onramp/реальные пополнения до готовой платежной инфраструктуры.
- Системные Wallet-награды.
- Внутренний Direct beyond very simple MVP.
- Нативные приложения.
- Сложные банковские интеграции, внешний вывод средств, счета, инвойсы, смарт-контракты.
- Vision/Sims full economy.
- AI autonomous/high-risk actions.
