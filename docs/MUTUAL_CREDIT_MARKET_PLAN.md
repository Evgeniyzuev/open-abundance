# Marketplace, User Economy Metrics And Participation Balance Plan

Статус: канонический план следующего этапа после Marketplace safety gate, сверенный с `MARKETPLACE_ESCROW_PLAN.md` 2026-08-07.

Имя файла сохранено для совместимости со ссылками. Термин `mutual credit` больше не является названием модели данных: система не выдаёт кредит, не создаёт долг пользователя и не разрешает отрицательный Wallet. Каноническое имя приватного рыночного сигнала — `participation_balance`.

## 1. Роль документов и границы

`MARKETPLACE_ESCROW_PLAN.md` остаётся источником правды для listings, deals, escrow, delivery, completion, refund, dispute и reviews. Этот документ описывает только следующий слой:

1. проверяемые периодические финансовые показатели пользователя;
2. единый read model `user_economy_metrics` для Wallet и Profile;
3. приватный `participation_balance`;
4. отдельный будущий shadow-эксперимент рекомендаций.

Read model не является вторым ledger. Его можно полностью удалить и восстановить из канонических фактов без изменения Wallet, Core, сделок или владения предметами.

Не входят в этот этап:

- изменение settlement RPC и финансовых балансов ради метрик;
- отрицательный Wallet, заём, кредитный лимит или обязательство пользователя покупать/продавать;
- ranking/boost в рабочей выдаче;
- публичная числовая репутация на основе оборота;
- бухгалтерская прибыль, налоги или гарантии дохода;
- TON escrow и blockchain settlement.

## 2. Результат сверки со старым планом

Старый `MUTUAL_CREDIT_MARKET_PLAN.md` частично устарел.

| Старый контракт | Каноническое решение |
| --- | --- |
| `mutual_market_balance` | `participation_balance` |
| Только rolling 90-day projection | Базовый read model `day / month / year / lifetime`; rolling 90 дней вычисляется отдельно только для будущего shadow ranking |
| Отдельный mutual-credit этап сразу после QA | Сначала полнота источников и пользовательские метрики, затем shadow recommendations |
| `marketplace_user_balances` и `marketplace_user_counterparties` | Не создавать; использовать один `user_economy_metrics`, distinct count контрагентов считать из сделок |
| Фиксированный cap `+10%` | Только предварительный пример; значение утверждается по shadow-данным и хранится в versioned config |
| Buyer review UI ещё впереди | Минимальный review flow уже есть в `WalletApp`; остаётся реальный buyer/seller User QA |
| Расчётная валюта `USD` | Текущий внутренний Wallet и Marketplace используют `$`; внешние TON/USDT суммы нормализуются в Wallet amount по зафиксированному settlement rate |

Порядок зависимостей:

```text
Marketplace remote apply + technical QA + buyer/seller User QA
→ полнота неизменяемых финансовых источников
→ user_economy_metrics + reconciliation
→ private Wallet/Profile UI
→ opt-in public metrics
→ participation shadow model
→ отдельное решение о closed-beta recommendations
```

## 3. Канонические источники

| Семейство | Источник правды | Время факта | Правило |
| --- | --- | --- | --- |
| Marketplace completion | `marketplace_deals`, `marketplace_escrows`, `wallet_ledger` | `marketplace_escrows.released_at` | Учитывать только финальный `completed` с released escrow |
| Marketplace refund | `marketplace_escrows`, `marketplace_deals`, `wallet_ledger` | `marketplace_escrows.refunded_at` | Учитывать фактический buyer credit один раз; не считать продажей/покупкой |
| Wallet postings | `wallet_ledger` | `created_at` | Считать только реально созданные credit/debit rows; failed attempts не являются движением |
| Daily Core accrual | `daily_core_accruals` | `accrual_date` UTC | `gross_amount`, `core_amount`, `wallet_amount` берутся только отсюда |
| Leader Core reward | `team_core_growth_rewards` | `bonus_date` UTC | Для получателя использовать `leader_user_id` и `reward_amount` |
| Wallet -> Core | `wallet_ledger` с `wallet_core_topup` | `created_at` | Одна сумма одновременно является Wallet debit и Core growth component |
| Challenge reward | `user_challenges` после нормализации | `reward_settled_at` | Не восстанавливать сумму из текущего текста челленджа, если исторический размер нельзя доказать |
| External deposit/withdrawal | rail settlement tables + `wallet_ledger` | финальный settlement time | Резервы и pending/failed операции не считать external inflow/outflow |
| Current balances | `wallet_accounts`, `core_accounts` | момент чтения | Это live snapshot, а не сумма периодических flow metrics |

`progress_snapshots`, feed stat blocks, `today_progress_events` и `core_accrual_obligations` не являются финансовыми источниками и не агрегируются повторно.

### Обязательный gap перед метриками

Сейчас `complete_user_challenge` меняет Core/Wallet, но `user_challenges` не хранит неизменяемые параметры выданной награды, а Wallet reward не гарантирует отдельную запись в `wallet_ledger`.

До backfill/read model нужно атомарно добавить в существующий `user_challenges`:

- `reward_account`;
- `reward_amount`;
- `reward_settled_at`;
- `reward_idempotency_key` или эквивалентный уникальный marker.

Для Wallet-награды тот же RPC должен писать `wallet_ledger.operation_type = 'challenge_reward'`. Отдельная таблица challenge rewards не нужна. Старые completed rows backfill-ятся только из доказуемой versioned-конфигурации или receipt; недоказуемая история помечается неполной и не заполняется предположением.

## 4. Контракт `user_economy_metrics`

### Grain и системные поля

Одна строка на:

```text
(user_id, period_type, period_key, currency_code)
```

- `period_type`: `day`, `month`, `year`, `lifetime`;
- `period_key`: `YYYY-MM-DD`, `YYYY-MM`, `YYYY` или `lifetime`;
- периоды и settlement timestamps хранятся в UTC;
- `currency_code = '$'` для текущего Wallet/Marketplace; Core-поля измеряются в единицах Core;
- `schema_version`, `source_watermark`, `is_reconciled`, `updated_at`, `last_reconciled_at`;
- все суммы — точные `numeric`, без расчётов через JavaScript float в источнике правды.

Месяц, год и lifetime пересчитываются из канонических фактов, а не суммируются слепо из day rows: иначе unique counterparties будут задвоены.

### Marketplace indicators

- `marketplace_sales_gross`;
- `marketplace_purchases_gross`;
- `marketplace_sales_net`;
- `marketplace_platform_fees_paid`;
- `marketplace_refunds_total`;
- `marketplace_completed_sales_count`;
- `marketplace_completed_purchase_count`;
- `marketplace_unique_counterparties_count`.

Текущий internal MVP fee-free: `marketplace_sales_net = marketplace_sales_gross`, `marketplace_platform_fees_paid = 0`. До появления утверждённой fee policy метрика комиссии не выводится как значимый результат.

Для completed deal одна и та же gross-сумма записывается покупателю как purchase и продавцу как sale. `cancelled`, `expired`, pending escrow и dispute без финального release не создают sale/purchase. Refund создаёт `marketplace_refunds_total`, но не completed turnover.

### `participation_balance`

```text
participation_balance(period)
  = marketplace_purchases_gross(period)
  - marketplace_sales_gross(period)
```

Это generated/derived field: его нельзя независимо увеличивать или исправлять. Он меняется только после пересчёта исходных purchase/sale metrics.

Правила:

- Wallet-to-Wallet, Wallet -> Core, rewards, deposits и withdrawals не влияют на `participation_balance`;
- положительное значение означает, что в выбранном периоде пользователь больше покупал у других, чем продавал;
- отрицательное значение означает обратную дельту, но не является долгом, штрафом или основанием скрыть карточки;
- owner может видеть показатель приватно с выбранным периодом;
- публичный Profile не показывает `participation_balance`, counterparties или anti-abuse flags;
- финансовый показатель содержит все подтверждённые completed сделки, а будущий ranking использует отдельный eligible signal после anti-abuse фильтров.

### Wallet flows

- `wallet_inflows_total`, `wallet_outflows_total`;
- `wallet_transfer_in`, `wallet_transfer_out`;
- `wallet_challenge_rewards`;
- `wallet_refunds_in`;
- `wallet_payout_from_core`;
- `wallet_core_topups`;
- `external_inflows_total`, `external_outflows_total`;
- `external_deposit_count`, `external_withdrawal_count`.

В UI использовать нейтральные названия `зачисления` и `списания`, а не `доходы` и `расходы`. Ledger posting и бизнес-результат различаются: escrow hold является реальным Wallet debit, а Marketplace purchase появляется только после completion; возврат создаёт обратный credit. Поэтому Wallet flows не должны подменять Marketplace turnover.

`wallet_payout_from_core` берётся из `daily_core_accruals.wallet_amount`, а не дублируется вторым суммированием feed snapshot. Если позже daily payout начнёт писать `wallet_ledger`, source mapping меняется одной versioned migration, чтобы исключить двойной счёт.

### Core indicators

- `core_growth_total`;
- `core_growth_wallet_topups`;
- `core_growth_challenge_rewards`;
- `core_growth_reinvest`;
- `core_growth_leader_bonus`;
- `core_growth_other_system`;
- `core_accrual_gross`;
- `core_balance_start`, `core_balance_end`, `core_level_end`.

Инвариант:

```text
core_growth_total
  = core_growth_wallet_topups
  + core_growth_challenge_rewards
  + core_growth_reinvest
  + core_growth_leader_bonus
  + core_growth_other_system
```

`core_growth_other_system` допускается только при наличии отдельного неизменяемого system/manual source; это не residual для маскировки расхождений. Пока такого источника нет, значение равно нулю, а необъяснимое отличие от `core_accounts.balance` делает reconciliation failed.

## 5. Обновление и reconciliation

Первая версия использует deterministic recompute, а не инкремент `counter = counter + amount` внутри settlement RPC.

Нужны service-role функции:

- `rebuild_user_economy_metrics(user_id, from_date, to_date)` — заново агрегирует затронутые day/month/year/lifetime rows и атомарно upsert-ит результат;
- `reconcile_user_economy_metrics(user_id)` — сравнивает projection с source totals и live balances;
- bounded batch wrapper для cron/admin с лимитом, cursor и `skip locked` или эквивалентной защитой конкуренции.

После успешного финансового действия API инициирует targeted refresh, но ошибка projection не откатывает уже завершённый settlement. Периодический reconciliation подхватывает пропущенный refresh. При повторном запуске результат должен быть идентичен.

Для первой закрытой beta допустим полный пересчёт пользователя. Отдельную event/contribution table или materialized ranking counters добавлять только после измеренной проблемы производительности.

## 6. RLS, API и видимость

### RLS

- authenticated user читает только собственные `user_economy_metrics`;
- insert/update/delete разрешены только service role;
- публичный endpoint читает только whitelist показателей, которые владелец явно открыл;
- raw ledger rows, counterparties, `participation_balance`, risk flags и reconciliation details публично недоступны.

Настройки публичности хранятся отдельно от финансовых фактов, например в `user_economy_metric_visibility(user_id, metric_key, period_type, is_public)`. Default — private; сервер валидирует `metric_key` по фиксированному allowlist.

### API

- `GET /api/economy/metrics?periodType=&periodKey=` — private owner summary;
- `PATCH /api/economy/metrics/visibility` — opt-in/opt-out разрешённых показателей;
- public Profile API — только разрешённые агрегаты с period, currency и `lastReconciledAt`;
- `POST /api/internal/economy/reconcile` — защищённый bounded worker endpoint.

Все GET routes используют `NO_STORE_HEADERS`, `dynamic = 'force-dynamic'`, `revalidate = 0`, `fetchCache = 'force-no-store'`; client fetch использует `cache: 'no-store'`.

## 7. UI

### Wallet: «Показатели»

- переключатель `День / Месяц / Год / Всё время`;
- Wallet: зачисления, списания и детализация по типам;
- Marketplace: покупки, продажи, завершённые сделки, возвраты;
- Core: общий рост и разложение по источникам;
- owner-only `participation_balance` с коротким пояснением «покупки у других минус продажи», без языка долга или обещания boost;
- отметки `$`, период и время последней сверки;
- состояние `данные ещё сверяются`, если `is_reconciled = false`, вместо показа приблизительного числа как точного.

### Profile

- все показатели private по умолчанию;
- пользователь может открыть только whitelist агрегатов и конкретный период;
- открытые карточки показывают `verified by system`, currency и период;
- `participation_balance` никогда не становится публичным рейтингом.

Экран следует shared keep-alive pattern: после первого payload уже видимый контент сохраняется, stale данные обновляются в фоне.

## 8. Этапы разработки

### Phase 0. Закрыть текущий Marketplace safety gate

- применить `20260806120000_marketplace_internal_escrow.sql` и связанную idempotency migration в целевом Supabase;
- подтвердить REST schema и `pnpm test:marketplace`;
- пройти SQL/API сценарии: completion, cancellation, expiry, refund, dispute resolution, concurrent buyers, duplicate request и insufficient balance;
- пройти buyer/seller User QA на двух реальных аккаунтах, включая существующий review flow.

Результат: escrow facts признаны стабильным источником для метрик. Метрики не входят в acceptance этого gate.

### Phase 1. Нормализовать финансовые источники

- расширить `user_challenges` и атомарный reward RPC;
- гарантировать Wallet ledger row для Wallet challenge reward;
- зафиксировать source mapping для final external deposits/withdrawals;
- написать reconciliation query для текущих Wallet/Core balances;
- определить политику неполного исторического backfill без догадок.

Результат: каждый новый Wallet/Core growth event имеет доказуемый источник и idempotency contract.

### Phase 2. Построить read model

- migration `user_economy_metrics`, indexes, constraints и RLS;
- generated/derived `participation_balance`;
- rebuild/reconcile functions и bounded worker;
- backfill day/month/year/lifetime;
- обновление `lib/database.types.ts`;
- deterministic contract test для schema, source mapping и запрещённых legacy tables.

Результат: повторный rebuild даёт тот же результат, projection сходится с источниками.

### Phase 3. Private API и Wallet UI

- owner metrics API;
- period selector и карточки Wallet/Marketplace/Core;
- loading/error/stale states без исчезновения уже показанных данных;
- owner-only explanation для `participation_balance`.

Результат: пользователь видит проверяемые показатели, но они ещё не публичны и не влияют на выдачу.

### Phase 4. Opt-in Profile visibility

- visibility schema/API;
- whitelist public cards;
- privacy/RLS tests;
- User QA переключения public/private на двух аккаунтах.

Результат: публичны только явно выбранные безопасные агрегаты.

### Phase 5. Отдельный participation shadow experiment

Только после Phase 0–4:

- вычислять `participation_balance_90d` из финальных eligible deals, не создавая вторую финансовую истину;
- отдельно применять exclusions для self/linked accounts, circular trading, reciprocal rings, artificial splitting и аномальных price patterns;
- проверить минимум unique counterparties, smoothing, decay и cap на реальных данных;
- логировать baseline score и shadow score, не менять порядок выдачи;
- добавить versioned config и kill switch;
- вынести closed-beta enablement в отдельное решение основателя.

Предварительное правило shadow mode: отрицательный signal не штрафует, положительный boost ограничен, relevance/eligibility и quality всегда доминируют. Число `+10%` не является утверждённым контрактом.

## 9. Проверки и acceptance criteria

### Данные

- completed deal создаёт ровно одну purchase metric покупателю и одну sale metric продавцу;
- cancel/expire/refund не создаёт completed turnover;
- dispute учитывается только после final resolution;
- duplicate settlement/rebuild не меняет итог;
- Wallet transfer и external flow не меняют `participation_balance`;
- day/month/year/lifetime используют UTC boundary и точную `$` precision;
- distinct counterparties не суммируются с дублями между днями;
- Core growth components сходятся с `core_growth_total`;
- необъяснимый Wallet/Core drift переводит row/report в failed reconciliation, а не записывается в `other`.

### Безопасность и продукт

- projection не может изменить Wallet/Core/listing/deal;
- пользователь читает только свои private metrics;
- публичны только opt-in whitelist cards;
- raw counterparties и `participation_balance` не попадают в public API;
- UI не называет оборот прибылью и не обещает доход/видимость;
- до отдельного Phase 5 decision ranking остаётся неизменным.

## 10. Решения, которые нужны позже

До shadow recommendations, но не до базовых метрик, определить:

- rolling window и decay;
- минимальное число unique counterparties;
- eligible-deal anti-abuse policy;
- maximum boost и category caps;
- dispute/fraud correction SLA;
- success metrics: incremental legitimate completions/GMV без роста returns, disputes, wash rate и seller exposure concentration.

Связанные документы: `MARKETPLACE_ESCROW_PLAN.md`, `TRUST_RECIPROCITY_MARKET_PLAN.md`, `OPEN_ABUNDANCE_MASTER_PLAN.md`, `MASTER_KANBAN.md`.
