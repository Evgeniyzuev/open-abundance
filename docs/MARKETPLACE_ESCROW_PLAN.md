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
- Regenerated `lib/database.types.ts`.
- Remaining Phase 1 app work: use the same ledger pattern for future Wallet-to-Wallet and marketplace escrow operations.

## Принципы

- Оплата только внутренним Wallet balance, без внешнего onramp/offramp.
- Условия сделки видны перед принятием: предмет, цена, продавец, покупатель, срок, что именно передается.
- Любое изменение условий сбрасывает принятие обеих сторон.
- Клиент не может сам завершить сделку прямыми update-запросами к таблицам.
- Предмет блокируется на время активной сделки, чтобы его нельзя было продать дважды.
- Деньги покупателя резервируются или переводятся в escrow ledger до финального завершения.
- Завершение сделки происходит в одной серверной транзакции.
- Trust события появляются после завершения, но публичная числовая репутация не вводится.

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
- `operation_type` - `marketplace_escrow_hold`, `marketplace_payment`, `marketplace_refund`, `wallet_transfer`, `system_adjustment`;
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
- `expires_at`
- `created_at`, `updated_at`

Правила:

- Один активный listing на один transferable unlocked artifact.
- Продавец может редактировать `draft/active`, но изменение условий создает новый `terms_hash`.
- После `reserved` редактирование запрещено; можно только cancel/expire по правилам.

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

## UI Plan

### Marketplace/Listings

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

## Implementation Phases

### Phase 1. Ownership And Ledger

- Done: `user_artifacts` с `transferable` и `locked_by_deal_id`.
- Done: `wallet_ledger`.
- Done for Wallet -> Core: `wallet_core_topup` RPC and `/api/core/topup`.
- Серверные helpers для следующих atomic Wallet balance changes: Wallet-to-Wallet, escrow hold, marketplace payment, refund.
- Done: RLS, пользователи читают свои ledger rows и свои/публичные предметы, но не могут напрямую менять ledger.

### Phase 2. Listings

- `marketplace_listings`.
- API create/list/cancel.
- UI listing grid и "sell item" из Results.

### Phase 3. Deals And Escrow

- `marketplace_deals`, `marketplace_deal_events`.
- Создание deal покупателем.
- Wallet reserve/escrow.
- Accept flow для продавца.

### Phase 4. Atomic Completion

- Server transaction / private RPC для completion.
- Transfer Wallet + item ownership.
- Refund/cancel/expire.
- Audit log и no-store refresh.

### Phase 5. Trust And Challenges

- `trust_events deal_completed`.
- Автопроверка `trust_event_confirmed:deal_completed`.
- Челленджи `Complete Marketplace Deal` и `Earn from Your Skill` только после ручной UX проверки MVP.

## Acceptance Criteria

- Пользователь может выставить transferable предмет на продажу.
- Другой пользователь видит условия и принимает их явно.
- Продавец принимает ту же версию условий.
- После двух acceptance одной версии сервер автоматически завершает сделку.
- Wallet покупателя уменьшается, Wallet продавца увеличивается, предмет меняет владельца.
- Невозможно продать один предмет дважды.
- Отмена/истечение возвращает зарезервированные средства.
- Успешная сделка создает audit log и Trust event.

## Next Step

Начать с Phase 1: `user_artifacts` + `wallet_ledger`. Без этого marketplace будет слишком хрупким: нельзя надежно проверить владение предметом, резерв средств и уникальность финансовой операции.
