# Marketplace Escrow And Item Sales Plan

Этот документ описывает MVP объявлений и продажи предметов между пользователями. Он дополняет `TRUST_RECIPROCITY_MARKET_PLAN.md` и не запускает публичную репутацию, Wallet-награды за челленджи или внешние платежи.

## Цель

Пользователь может выставить предмет на продажу, другой пользователь может принять явные условия сделки, и после принятия актуальной версии условий обеими сторонами сервер автоматически и атомарно переводит:

- предмет от продавца покупателю;
- оплату из Wallet покупателя в Wallet продавца.

## Current Status

2026-08-07 (current internal-only implementation):

- `20260806120100_marketplace_internal_escrow.sql` adds listing kinds, nullable artifacts for services/physical goods, versioned terms, a minimal `marketplace_escrows` state table, reviews and idempotent hold/release/refund RPCs.
- The current MVP deliberately does not create `marketplace_user_balances` or `marketplace_user_counterparties`. The generalized `user_economy_metrics` period read model is now implemented as a rebuildable projection; ranking remains deferred and Wallet truth remains in `wallet_accounts`/`wallet_ledger`.
- `marketplace_escrows` stores only the one-per-deal lifecycle and idempotency keys. Participants, amount and currency are read from the immutable deal snapshot; there is no zero-only `fee_amount` column.
- `/api/marketplace/listings` now supports detail/edit; `/api/marketplace/deals` supports required idempotency and explicit accept/cancel/deliver/confirm/dispute/review actions plus protected timer/operator endpoints.
- Wallet-to-Wallet requires a stable idempotency key and returns a canonical receipt with both ledger records and post-transfer balances. Transfers remain fee-free and have no amount/daily limits beyond positive amount, `$` precision and sufficient balance.
- Remote REST schema for the existing marketplace deals/listings is available; no deals or relevant ledger operations were present during the read-only check. The new migration is prepared but not applied remotely; buyer/seller User QA is still pending.
- This card is DB-only. TON contracts, on-chain escrow, audits and blockchain settlement are explicitly deferred.
- `20260807120000_user_economy_metrics.sql` adds immutable challenge reward settlement fields, the `user_economy_metrics`/visibility tables, rebuild/reconciliation functions, RLS and deterministic auth-user backfill. Its remote apply and buyer/seller QA remain open gates.
- `20260807130000_currency_symbol_dollar.sql` normalizes Wallet, Marketplace and economy read-model currency data/defaults to `$`.

2026-06-12:

- Phase 1 database foundation added and applied:
  - `20260612072754_marketplace_phase1_ownership_ledger.sql`;
  - `20260612073116_wallet_ledger_counterparty_index.sql`.
- Added `user_artifacts` with ownership, visibility, transferability, source metadata and future `locked_by_deal_id`.
- Added `wallet_ledger` with direction, amount, operation/source markers, `balance_after`, idempotency key and counterparty support.
- Added RLS: authenticated users can read own Wallet ledger rows and own/public artifacts; writes remain server-side/service-role.
- Added and applied `20260612082003_wallet_core_topup_rpc.sql`: `wallet_core_topup` RPC moves Wallet -> Core atomically, writes `wallet_ledger`, is `SECURITY INVOKER`, and grants execute only to `service_role`.
- `/api/core/topup` now uses `wallet_core_topup` instead of parallel table updates.
- Added and applied `20260612082405_first_wallet_to_core_challenge.sql`; `/api/challenges/check` verifies `first_wallet_to_core` through `wallet_ledger`.
- Added and applied `20260612101538_wallet_transfer_rpc.sql`: `wallet_transfer` RPC moves Wallet between two users atomically, writes debit/credit ledger rows, supports idempotency suffixes and grants execute only to `service_role`.
- Added `/api/wallet/transfer` server route for Wallet-to-Wallet transfers.
- Added and applied `20260612101807_first_wallet_transfer_challenge.sql`; `/api/challenges/check` verifies `first_wallet_transfer` through outgoing `wallet_ledger` debit rows.
- Added Wallet transfer modal in `components/WalletApp.tsx`: contact selection, manual recipient user id fallback, amount input, explicit confirmation and Wallet refresh after success.
- Added and applied `20260612105115_marketplace_listings_phase2.sql`: `marketplace_listings` with RLS, active/own read policy, open-listing uniqueness per item and indexes.
- Added `/api/marketplace/listings` and `/api/marketplace/listings/[listingId]/cancel`; users can list own transferable unlocked items and cancel own active/draft listings.
- Added first Market UI as the third Wallet top tab: active listing grid, sell item modal, own-listing cancel action.
- Updated Market creation flow: user can create a product/service/skill card directly; the server creates a transferable `user_artifacts` row and active listing together.
- Added MVP listing limit: open listing cards per user cannot exceed the user's current Core level.
- Current listing quality layer: sales count, buyer rating and buyer reviews. Mutual market balance ranking signals remain deferred until the read-model phase.
- Regenerated `lib/database.types.ts`.
- На эту дату оставались Phase 3 deals/escrow и atomic completion.

2026-07-24 / проверено по коду 2026-08-01 (historical snapshot; superseded by the 2026-08-06 implementation above):

- migration `20260724230000_marketplace_deals_phase3_4.sql` добавляет `marketplace_deals`, events и RPC create/accept/complete/cancel;
- `/api/marketplace/deals` и `/api/marketplace/deals/[dealId]` дают deal lifecycle;
- listing и artifact резервируются, а completion в одной DB transaction проверяет Wallet, списывает/зачисляет баланс и передаёт artifact;
- buyer Wallet funds при create/accept ещё не резервировались и не переводились в escrow;
- automated expire, refund, dispute, idempotent completion key и reviews отсутствовали;
- этот snapshot больше не описывает текущий код; remote apply и ручной User QA новой migration остаются отдельными gate.

## Принципы

- Оплата только внутренним Wallet balance, без внешнего onramp/offramp.
- Условия сделки видны перед принятием: предмет, цена, продавец, покупатель, срок, что именно передается.
- Любое изменение условий сбрасывает принятие обеих сторон.
- Клиент не может сам завершить сделку прямыми update-запросами к таблицам.
- Предмет блокируется на время активной сделки, чтобы его нельзя было продать дважды.
- Деньги покупателя резервируются или переводятся в escrow ledger до финального завершения.
- Завершение сделки происходит в одной серверной транзакции.
- Trust event появляется после безопасного завершения. Публичный Trust v2 не входит в этот marketplace slice и запускается позже через shadow/private/public этапы.

## MVP Scope

Входит:

- объявления о продаже предметов;
- просмотр активных объявлений;
- создание сделки покупателем;
- явное принятие условий покупателем и продавцом;
- escrow/reserve Wallet средств;
- атомарный transfer Wallet + item ownership;
- cancel/expire/refund;
- audit log событий сделки;
- Trust event для завершённой сделки не входит в текущий safety MVP; он остаётся отдельным Phase 5 шагом.

Не входит:

- внешние деньги;
- вывод средств;
- сложный арбитраж;
- публичный numeric rating;
- аукционы;
- частичные платежи;
- торговля несуществующими предметами;
- продажа системных/непередаваемых артефактов.

## Data Model

### `user_artifacts`

Базовая таблица владения предметами. Часть уже описана в Trust plan.

Нужные поля для торговли:

- `id`
- `user_id`
- `artifact_type`
- `title`
- `description`
- `image_url`
- `rarity`
- `visibility`
- `transferable boolean`
- `locked_by_deal_id uuid null`
- `source_type`, `source_id`
- `metadata jsonb`
- `created_at`, `updated_at`

Правила:

- `transferable = false` для системных предметов, сертификатов и важных proof-артефактов.
- `locked_by_deal_id` запрещает параллельную продажу.
- Передача владельца всегда идет через серверный route/RPC.

### `wallet_ledger`

Единый журнал операций Wallet.

Минимальные поля:

- `id`
- `user_id`
- `direction` - `credit`, `debit`;
- `amount`
- `currency` - MVP: `USD`;
- `operation_type` - `marketplace_escrow_hold`, `marketplace_payment`, `marketplace_refund`, `wallet_transfer`, `wallet_core_topup`, `challenge_reward`, `system_adjustment`;
- `source_type`
- `source_id`
- `counterparty_user_id`
- `balance_after`
- `created_at`
- `metadata jsonb`

Правила:

- Баланс меняется только вместе с записью ledger.
- Для сделок нужен unique source marker, чтобы не провести оплату повторно.

### `marketplace_listings`

Объявление о продаже.

Поля:

- `id`
- `seller_user_id`
- `artifact_id`
- `title`
- `description`
- `price_amount`
- `currency`
- `status` - `draft`, `active`, `reserved`, `sold`, `cancelled`, `expired`;
- `terms_json`
- `terms_hash`
- `sales_count`
- `rating_count`
- `rating_sum`
- `rating_average`
- `review_count`
- `expires_at`
- `created_at`, `updated_at`

Правила:

- Один активный listing на один transferable unlocked artifact.
- Продавец может редактировать `draft/active`, но изменение условий создает новый `terms_hash`.
- После `reserved` редактирование запрещено; можно только cancel/expire по правилам.

Listing quality counters:

- `sales_count`, `rating_*` and `review_count` are server-maintained counters, never client-submitted values.
- `rating_average` should be displayed as a smoothed/Bayesian value while `rating_count` is low.
- Listing cards can show sales count and rating, but public UI must avoid turning this into a global user reputation score.

### `marketplace_reviews`

Buyer review after a completed marketplace deal.

Fields:

- `id`
- `deal_id` unique
- `listing_id`
- `seller_user_id`
- `buyer_user_id`
- `rating` integer, 1..5
- `review_text`
- `status` - `published`, `hidden`, `flagged`;
- `created_at`, `updated_at`

Rules:

- Only the buyer of a `completed` deal can leave a review.
- One review per deal.
- Seller cannot edit or delete buyer reviews.
- Moderation may hide review text, but aggregates must be recalculated consistently.
- Reviews do not mutate Wallet ledger or deal completion; they are a separate quality/trust layer.

### Deferred: `user_economy_metrics` period read model

`user_economy_metrics` is one denormalized, server-maintained read model for Wallet/Profile display. It is not a second ledger and never replaces the authoritative source tables. It should be rebuildable from those sources, so a lost aggregate cannot lose money or Core.

Do not create separate `marketplace_user_balances`, `marketplace_user_counterparties` or `marketplace_user_market_stats` tables. Keep the needed marketplace and economy counters in this single aggregate; derive counterparties as a count, not as a writable relationship table.

#### Row grain and periods

- `user_id`
- `period_type` - `day`, `month`, `year`, `lifetime`
- `period_key` - UTC day/month/year key, or `lifetime`
- `currency_code` - `$` for the current Wallet and Marketplace; Core fields are non-currency balance units
- `schema_version`, `source_watermark`, `is_reconciled`, `updated_at`, `last_reconciled_at`

Use the actual posting/settlement time. For Marketplace, only the final seller-credit or buyer-refund outcome counts; listing views, clicks, holds, acceptance and pending escrows do not. Store UTC periods and convert to the viewer's timezone only when rendering.

#### Marketplace indicators

- `marketplace_sales_gross` - completed Marketplace sale amount before any platform fee
- `marketplace_purchases_gross` - completed Marketplace purchase amount before any platform fee
- `marketplace_sales_net` - seller credit after the fee, when a fee is enabled
- `marketplace_platform_fees_paid` - fee charged to the buyer/seller according to the final fee policy; keep it separate even when the current internal MVP fee is zero
- `marketplace_refunds_total` - finalized buyer refunds, not a sale or purchase
- `marketplace_completed_sales_count`, `marketplace_completed_purchase_count`
- `marketplace_unique_counterparties_count`
- `participation_balance` is generated/derived as `marketplace_purchases_gross - marketplace_sales_gross` and is never written independently. It is a marketplace signal only; Wallet-to-Wallet transfers and external flows must not change it.

The same gross amount is used for the buyer's purchase and the seller's sale, so the two metrics remain comparable. A disputed deal contributes nothing until final resolution: release to the seller counts as completion, while refund to the buyer does not. A later correction must be an idempotent correction event rather than an in-place rewrite of history.

#### Wallet flows

- `wallet_inflows_total` - all finalized Wallet credits, including Marketplace proceeds, internal transfers, rewards, refunds, Core accrual payouts and external deposits
- `wallet_outflows_total` - all actually posted Wallet debits, including Marketplace escrow holds, internal transfers, Core top-ups, fees and external withdrawal reservations; final Marketplace purchases and external withdrawals remain separate business-outcome metrics
- `wallet_transfer_in`, `wallet_transfer_out` - fee-free internal Wallet-to-Wallet movement, kept separate because it can be repeated without representing Marketplace participation
- `wallet_challenge_rewards` - challenge rewards paid to Wallet
- `wallet_refunds_in` - Marketplace or other refunds credited back to Wallet
- `wallet_payout_from_core` - the Wallet part of daily Core accrual (`daily_core_accruals.wallet_amount`)
- `wallet_core_topups` - Wallet amount moved into Core; this is a Wallet debit and also a Core-growth component, not external income
- `external_inflows_total`, `external_outflows_total` - finalized external deposits and withdrawals only; pending reservations, failed attempts and internal transfers are excluded
- `external_deposit_count`, `external_withdrawal_count`

At the ledger layer use the neutral labels `зачисления` and `списания`. Do not add generic `income/expense` totals to this table: economic income/expense depends on classification and would double-count sales, transfers, rewards and withdrawals. If finance reporting is needed later, expose a separately documented derived view.

#### Core growth indicators

- `core_growth_total`
- `core_growth_wallet_topups` - Wallet -> Core via `wallet_core_topup`
- `core_growth_challenge_rewards` - challenge rewards issued directly to Core
- `core_growth_reinvest` - `daily_core_accruals.core_amount` from the daily reinvest percentage
- `core_growth_leader_bonus` - `team_core_growth_rewards.reward_amount`; this increases the leader's Core, not Wallet
- `core_growth_other_system` - explicit, separately labelled system/manual adjustments only
- `core_accrual_gross` - the full daily accrual before it is split between Core and Wallet
- `core_balance_start`, `core_balance_end`, `core_level_end` - period snapshots, not flow metrics

The invariant is `core_growth_total = core_growth_wallet_topups + core_growth_challenge_rewards + core_growth_reinvest + core_growth_leader_bonus + core_growth_other_system`. A change in `core_after - core_before` must not replace source attribution; an unexplained difference is a reconciliation failure and must not be hidden in `core_growth_other_system`.

#### Existing period statistics and canonical sources

- `wallet_ledger` already records Wallet movements and has no day/month/year/lifetime aggregate. It is the source for Wallet flow categories and the `wallet_core_topup` debit.
- `daily_core_accruals` is the canonical daily source for `gross_amount`, `core_amount` (reinvest) and `wallet_amount`.
- `team_core_growth_rewards` is the canonical dated source for leader bonuses (`bonus_date`, `settlement_kind`, `reward_amount`).
- `user_challenges` currently records completion status, while `complete_user_challenge` updates Core/Wallet directly. Before metrics are built, extend this existing row with immutable `reward_account`, `reward_amount`, `reward_settled_at` and an idempotency marker; Wallet rewards must also write `wallet_ledger` with `operation_type = 'challenge_reward'`. This avoids introducing a separate challenge-reward table.
- `progress_snapshots` repeats daily accrual data for the social feed. It is a display projection, not a financial source and must not be aggregated a second time.
- `core_accrual_obligations` contains expected/safety values, not settled user growth; `today_progress_events` is progress telemetry, not accounting.
- `crypto_deposit`/`crypto_withdrawal` metrics count only final rail settlements; pending reservations and failed attempts are excluded. TON implementation remains outside this internal-only card.
- No general user-level day/month/year/lifetime economy aggregate was found. `user_economy_metrics` is therefore a new read model, not a duplicate of an existing period table.

#### Update, reconciliation and visibility

- Maintain one row per `(user_id, period_type, period_key, currency_code)`; do not create one table per period.
- Recompute affected rows deterministically from authoritative facts after settlement/jobs and provide periodic reconciliation; repeated rebuilds must produce the same result.
- Expose read-only aggregates in Wallet and Profile. A user may opt only whitelisted indicators and periods into the public profile; show the period, currency and “verified by system”, never raw ledger rows, counterparties or `participation_balance`.
- `user_economy_metrics` supplies ranking inputs only. It does not store a recommendation score or boost.

### Deferred separately: Marketplace recommendations

After buyer/seller QA, a separate recommendations plan may use `participation_balance`, completion counts, sales and listing quality. Any ranking boost must be explicitly capped (the existing `+10%` is only a provisional example), must not hard-hide a listing by itself and must be tested in shadow mode before closed-beta enablement. No ranking algorithm is implemented as part of the current marketplace or metrics work.

### `marketplace_deals`

Конкретная сделка между продавцом и покупателем.

Поля:

- `id`
- `listing_id`
- `seller_user_id`
- `buyer_user_id`
- `artifact_id`
- `price_amount`
- `currency`
- `terms_json`
- `terms_hash`
- `status` - `proposed`, `awaiting_seller`, `awaiting_buyer`, `accepted`, `completed`, `cancelled`, `expired`, `refunded`, `disputed`;
- `buyer_accepted_terms_hash`
- `seller_accepted_terms_hash`
- `buyer_accepted_at`
- `seller_accepted_at`
- `escrow_held_at`
- `completed_at`
- `cancelled_at`
- `expires_at`
- `metadata jsonb`

Правила:

- `buyer_user_id != seller_user_id`.
- Только одна незавершенная сделка на listing.
- Если `buyer_accepted_terms_hash = seller_accepted_terms_hash = terms_hash`, сервер может завершать сделку.
- Если условия меняются, acceptance fields очищаются.

### `marketplace_deal_events`

Неизменяемый audit log.

Поля:

- `id`
- `deal_id`
- `actor_user_id`
- `event_type` - `created`, `buyer_accepted`, `seller_accepted`, `escrow_held`, `completed`, `cancelled`, `expired`, `refunded`, `disputed`;
- `metadata jsonb`
- `created_at`

## Product Flow

### 1. Seller Creates Listing

1. Продавец выбирает transferable предмет.
2. Указывает цену, описание и условия.
3. Сервер проверяет владение предметом и `transferable = true`.
4. Listing становится `active`.

### 2. Buyer Starts Deal

1. Покупатель открывает listing.
2. Видит карточку предмета, цену, продавца и явные условия.
3. Нажимает accept.
4. Сервер проверяет баланс Wallet и резервирует сумму.
5. Deal получает buyer acceptance и ждет seller acceptance.

### 3. Seller Accepts Same Terms

1. Продавец видит deal summary.
2. Принимает условия той же версии.
3. Сервер сравнивает `terms_hash`.
4. Если обе стороны приняли текущие условия, запускается completion transaction.

### 4. Atomic Completion

В одной транзакции:

1. lock rows: listing, deal, artifact, buyer wallet, seller wallet;
2. проверить статусы, владельца предмета, escrow/reserved funds и matching `terms_hash`;
3. списать/релизнуть Wallet покупателя;
4. зачислить Wallet продавцу;
5. сменить `user_artifacts.user_id` на покупателя;
6. очистить `locked_by_deal_id`;
7. поставить listing `sold`, deal `completed`;
8. записать wallet ledger и marketplace event. `trust_events deal_completed` остаётся отдельным Phase 5 шагом.

Если любой шаг падает, вся транзакция откатывается.

### 5. Buyer Review

1. After a deal becomes `completed`, the buyer sees a lightweight review prompt.
2. Buyer can leave rating 1..5 and optional review text.
3. Server verifies buyer/deal/listing ownership and writes exactly one `marketplace_reviews` row per deal.
4. Server recalculates listing rating/review counters only; `user_economy_metrics` remains a later read-model step.
5. Review does not change the completed deal, Wallet ledger or item ownership.

## Discovery And Ranking

Marketplace ordering may eventually combine product quality, market participation and freshness. This section is a future recommendation contract, not an implementation requirement for the internal MVP:

```text
listing_score =
  freshness
  + smoothed_rating_boost
  + log(1 + sales_count) * sales_weight
  + capped_participation_boost
  - risk_or_report_penalty
```

Rules:

- `participation_balance = marketplace_purchases_gross - marketplace_sales_gross` is marketplace-specific and private/system-facing.
- Positive balance means the user has supported other sellers more than they earned; it may softly boost their own cards.
- Negative balance may reduce the boost, but must not hard-hide cards by itself.
- Apply a strict cap (the existing `+10%` is provisional) so one large purchase or one high-value sale cannot dominate discovery.
- Always mix in freshness and category diversity so new sellers still get surface area.
- Public UI can show listing-level sales and rating, but should not expose `participation_balance` as a public numeric reputation.
- Implement the algorithm later in a separate recommendations plan; no ranking score is stored in `user_economy_metrics` now.

## API Plan

- `GET /api/marketplace/listings`
  Список активных объявлений.
- `POST /api/marketplace/listings`
  Создать объявление текущего пользователя.
- `PATCH /api/marketplace/listings/[listingId]`
  Обновить draft/active listing; изменение условий сбрасывает deal acceptance.
- `POST /api/marketplace/listings/[listingId]/cancel`
  Снять объявление.
- `POST /api/marketplace/deals`
  Создать deal и принять условия покупателем.
- `GET /api/marketplace/deals`
  Мои сделки: buying/selling.
- `POST /api/marketplace/deals/[dealId]/accept`
  Принять текущие условия. Если обе стороны уже приняли, завершить сделку.
- `POST /api/marketplace/deals/[dealId]/cancel`
  Отменить сделку и вернуть escrow, если это разрешено статусом.

Все мутации должны идти через server route с service-role или через RPC в private schema. Не класть `security definer` функции в exposed `public` schema.

Additional quality API:

- `POST /api/marketplace/deals/[dealId]/review`
  Buyer leaves one rating/review after a completed deal.
- `GET /api/marketplace/listings/[listingId]/reviews`
  Public listing review list with hidden/flagged reviews filtered out.

## UI Plan

### Marketplace/Listings

- card stats: sales count, smoothed rating and review count;
- detail view: full terms, seller, sales count, rating summary and published buyer reviews;

- сетка объявлений: картинка предмета, название, цена, продавец;
- фильтр "available";
- пустое состояние "нет активных объявлений";
- кнопка "Продать предмет" из Results/Inventory для transferable items.

### Deal Modal

Показывать:

- предмет;
- цена;
- продавец и покупатель;
- условия сделки;
- срок истечения;
- чекбокс "Я принимаю условия этой версии";
- результат: `Ожидает продавца`, `Ожидает покупателя`, `Завершено`, `Отменено`, `Истекло`.

### Review Prompt

- shown only to the buyer after `completed`;
- rating selector 1..5 and optional short review;
- published review appears on the listing detail;
- seller sees review but cannot edit/delete it.

### Inventory

- transferable marker;
- locked/reserved marker;
- detail view с историей получения и торговым статусом.

## Anti-Abuse

- Self-deal запрещен.
- Один активный deal на listing.
- Предмет нельзя продать, если он уже locked.
- Минимальная цена и decimal precision на сервере.
- Idempotency key или unique source marker для payment/refund.
- Rate limit на создание listings/deals.
- Истечение pending deals.
- Dispute status оставить в схеме, но UI MVP может показывать только "обратиться в поддержку/ручная проверка".
- High-value deals позже требуют ручного review.

Additional quality anti-abuse:

- Buyer reviews only after completed deals.
- One review per deal; edits should either be disabled for MVP or written with an audit trail.
- Sales count counts only completed deals.
- Rating display must be smoothed for low sample sizes.
- Mutual market balance is a capped discovery signal, not a public score and not a hard visibility block.

## Implementation Phases

### Phase 1. Ownership And Ledger

- Done: `user_artifacts` с `transferable` и `locked_by_deal_id`.
- Done: `wallet_ledger`.
- Done for Wallet -> Core: `wallet_core_topup` RPC and `/api/core/topup`.
- Done for Wallet-to-Wallet: `wallet_transfer` RPC, `/api/wallet/transfer` and Wallet transfer modal.
- Серверные helpers для следующих atomic Wallet balance changes: escrow hold, marketplace payment, refund.
- Done: RLS, пользователи читают свои ledger rows и свои/публичные предметы, но не могут напрямую менять ledger.

### Phase 2. Listings

- Done: `marketplace_listings`.
- Done: API create/list/cancel.
- Done: UI listing grid and `Sell item` modal in Wallet -> Market.
- Done: user-created product/service/skill cards with image URL, title, description/terms and price.
- Done: per-user open listing limit equals current Core level.
- Pending: optional entry point from Results/Inventory once real transferable quest items are visible there.

### Phase 3. Deals And Escrow

- Done in code: `marketplace_deals`, `marketplace_deal_events`, `marketplace_escrows`, buyer create и seller accept.
- Done in code: listing/artifact lock, buyer Wallet hold, отдельные hold ledger rows и обязательный idempotency contract.
- Pending: remote migration apply, REST schema verification and buyer/seller User QA.

### Phase 4. Atomic Completion

- Done in code: private completion RPC, Wallet debit/credit, artifact transfer, listing `sold` и deal event в одной transaction.
- Done in code: cancel/refund before seller acceptance, 24h expiry worker, 72h auto-release, dispute resolution and idempotent retries.
- Done in code: one immutable buyer review per completed deal and server-maintained listing quality counters.
- Implemented locally: `user_economy_metrics` period read model, unique-counterparty count, challenge reward normalization, reconciliation and private Wallet/Profile APIs; remote apply and buyer/seller User QA remain pending.
- Pending: remote apply, SQL/API integration checks and no-store buyer/seller User QA.

### Phase 5. Trust And Challenges

- `trust_events deal_completed`.
- Автопроверка `trust_event_confirmed:deal_completed`.
- Челленджи `Complete Marketplace Deal` и `Earn from Your Skill` только после ручной UX проверки MVP.

### Phase 6. Reviews, Ratings And Economy Metrics

- `marketplace_reviews`.
- Buyer review API and listing reviews API.
- Recalculate listing rating/review counters.
- Build the single `user_economy_metrics` read model with `day`, `month`, `year` and `lifetime` rows from the canonical sources listed above.
- Backfill Marketplace sales/purchases only from final settlement, add Wallet inflow/outflow categories, and add the named Core-growth components plus the reconciliation invariant.
- Close the challenge-reward accounting gap before counting challenge rewards; do not add a second reward table.
- Add read-only Wallet/Profile display and opt-in public visibility of selected metrics.

### Phase 7. Recommendations (separate future plan)

- Define the ranking formula and the maximum boost after the metrics read model and buyer/seller QA are trusted.
- Run any recommendation signal in shadow mode first; closed-beta enablement requires a separate founder decision.
- The present card does not implement ranking, recommendation scores or boost calculations.

## Acceptance Criteria

- Пользователь может выставить transferable предмет на продажу.
- Другой пользователь видит условия и принимает их явно.
- Продавец принимает ту же версию условий.
- После двух acceptance одной версии сервер автоматически завершает сделку.
- Wallet покупателя уменьшается, Wallet продавца увеличивается, предмет меняет владельца.
- Невозможно продать один предмет дважды.
- Отмена/истечение возвращает зарезервированные средства.
- Успешная сделка создает audit log; Trust event подключается отдельным Phase 5 шагом.

Additional quality criteria:

- Completed deals increment listing sales count.
- Buyer can leave one rating/review after completion.
- Listing cards show sales count and smoothed rating/review count.
- Future Marketplace recommendations may use a capped `participation_balance` signal without exposing it as a public numeric reputation; ranking is not part of the current MVP acceptance gate.

## Next Step

The local `user_economy_metrics` implementation is complete; the remaining gate is remote migration apply, reconciliation verification and buyer/seller QA. Ranking and boost stay out of this gate.

Закрыть текущий внутренний safety gate:

1. подтвердить remote migration apply и проверить REST schema;
2. прогнать SQL/API сценарии hold, completion, cancellation, expiry, refund, dispute, concurrent buyers, duplicate requests и insufficient balance;
3. пройти buyer/seller User QA на двух реальных аккаунтах: Wallet transfer → listing → buy → accept/deliver/confirm → refund → dispute;
4. после подтверждения основателя перенести Marketplace в `Подтверждено`; затем выполнять `MUTUAL_CREDIT_MARKET_PLAN.md` как отдельный metrics/read-model этап, не включая ranking/boost в текущий gate.
