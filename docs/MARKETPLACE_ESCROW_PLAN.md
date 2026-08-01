# Marketplace Escrow And Item Sales Plan

Этот документ описывает MVP объявлений и продажи предметов между пользователями. Он дополняет `TRUST_RECIPROCITY_MARKET_PLAN.md` и не запускает публичную репутацию, Wallet-награды за челленджи или внешние платежи.

## Цель

Пользователь может выставить предмет на продажу, другой пользователь может принять явные условия сделки, и после принятия актуальной версии условий обеими сторонами сервер автоматически и атомарно переводит:

- предмет от продавца покупателю;
- оплату из Wallet покупателя в Wallet продавца.

## Current Status

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
- Planned marketplace quality layer: sales count, buyer rating, buyer reviews and mutual market balance ranking signals.
- Regenerated `lib/database.types.ts`.
- На эту дату оставались Phase 3 deals/escrow и atomic completion.

2026-07-24 / проверено по коду 2026-08-01:

- migration `20260724230000_marketplace_deals_phase3_4.sql` добавляет `marketplace_deals`, events и RPC create/accept/complete/cancel;
- `/api/marketplace/deals` и `/api/marketplace/deals/[dealId]` дают deal lifecycle;
- listing и artifact резервируются, а completion в одной DB transaction проверяет Wallet, списывает/зачисляет баланс и передаёт artifact;
- buyer Wallet funds при create/accept ещё не резервируются и не переводятся в escrow; достаточность проверяется только в момент completion;
- automated expire, refund, dispute, idempotent completion key, `deal_completed` Trust event и reviews не реализованы;
- migration/environment apply и ручной User QA не подтверждены, поэтому это partial Phase 3/4 foundation, а не готовый escrow.

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
- `trust_events` с `event_type = deal_completed` после успешной сделки.

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

### `marketplace_user_balances`

Denormalized market mutual balance for ranking and discovery.

Fields:

- `user_id`
- `spent_amount`
- `earned_amount`
- `mutual_market_balance` = `spent_amount - earned_amount`
- `completed_buy_count`
- `completed_sell_count`
- `review_count`
- `average_seller_rating`
- `updated_at`

Rules:

- Count only completed marketplace deals.
- Do not expose this as public numeric reputation.
- Use it as a capped ranking boost: users who spend/support the market get softer promotion for their own cards.
- Negative balance can reduce boost, but must not hard-hide cards by itself.
- High-risk categories can use stricter caps or manual review.

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
8. записать wallet ledger, marketplace event и `trust_events deal_completed`.

Если любой шаг падает, вся транзакция откатывается.

### 5. Buyer Review

1. After a deal becomes `completed`, the buyer sees a lightweight review prompt.
2. Buyer can leave rating 1..5 and optional review text.
3. Server verifies buyer/deal/listing ownership and writes exactly one `marketplace_reviews` row per deal.
4. Server recalculates listing counters and seller market balance summary.
5. Review does not change the completed deal, Wallet ledger or item ownership.

## Discovery And Ranking

Marketplace ordering should combine product quality, market participation and freshness:

```text
listing_score =
  freshness
  + smoothed_rating_boost
  + log(1 + sales_count) * sales_weight
  + capped_mutual_balance_boost
  - risk_or_report_penalty
```

Rules:

- `mutual_market_balance = spent_amount - earned_amount` is marketplace-specific and private/system-facing.
- Positive balance means the user has supported other sellers more than they earned; it can softly boost their own cards.
- Negative balance can reduce the boost, but should not hard-hide cards by itself.
- Apply caps so one large purchase or one high-value sale cannot dominate discovery.
- Always mix in freshness and category diversity so new sellers still get surface area.
- Public UI can show listing-level sales and rating, but should not expose `mutual_market_balance` as a public numeric reputation.

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

- Done in code: `marketplace_deals`, `marketplace_deal_events`, buyer create и seller accept.
- Done in code: listing/artifact lock на активную сделку.
- Pending: atomic buyer Wallet reserve/escrow при accept, отдельные hold ledger rows и idempotency contract.
- Pending: migration apply и User QA.

### Phase 4. Atomic Completion

- Done in code: private completion RPC, Wallet debit/credit, artifact transfer, listing `sold` и deal event в одной transaction.
- Done in code: manual cancel освобождает artifact/listing до completion.
- Pending: automatic expire, true refund после hold, dispute и retry/idempotency proof.
- Pending: `sales_count`, `marketplace_user_balances`, Trust event и no-store end-to-end QA.

### Phase 5. Trust And Challenges

- `trust_events deal_completed`.
- Автопроверка `trust_event_confirmed:deal_completed`.
- Челленджи `Complete Marketplace Deal` и `Earn from Your Skill` только после ручной UX проверки MVP.

### Phase 6. Reviews, Ratings And Discovery

- `marketplace_reviews`.
- Buyer review API and listing reviews API.
- Recalculate listing rating/review counters.
- Maintain `marketplace_user_balances` from completed deals.
- Apply capped mutual market balance, rating and sales count to listing ranking.

## Acceptance Criteria

- Пользователь может выставить transferable предмет на продажу.
- Другой пользователь видит условия и принимает их явно.
- Продавец принимает ту же версию условий.
- После двух acceptance одной версии сервер автоматически завершает сделку.
- Wallet покупателя уменьшается, Wallet продавца увеличивается, предмет меняет владельца.
- Невозможно продать один предмет дважды.
- Отмена/истечение возвращает зарезервированные средства.
- Успешная сделка создает audit log и Trust event.

Additional quality criteria:

- Completed deals increment listing sales count.
- Buyer can leave one rating/review after completion.
- Listing cards show sales count and smoothed rating/review count.
- Marketplace ranking uses capped mutual market balance without exposing it as a public numeric reputation.

## Next Step

Не включать mutual credit, reviews или Trust v2 поверх текущего partial foundation. Сначала закрыть safety gap:

1. применить migration в целевом окружении и пройти create → accept → complete/cancel User QA;
2. атомарно резервировать buyer Wallet при принятии сделки и писать hold ledger;
3. реализовать idempotent expire/refund и сценарий insufficient balance/retry;
4. добавить dispute/manual review и `deal_completed` event;
5. только затем reviews, mutual credit discovery и Trust v2.
