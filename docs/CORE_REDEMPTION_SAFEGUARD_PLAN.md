# Core Redemption Safeguard

Статус: технический контур добавлен в миграции `20260727140000_core_redemption_safeguard.sql` и серверные маршруты, но пользовательское обещание redemption не включается до операционного и юридического допуска.

## Цель и границы

Core остается неприкосновенным в обычном пользовательском цикле: пропуск Today, отказ от челленджа или отсутствие активности не уменьшают баланс. Единственный путь уменьшения Core — атомарный redemption после подтвержденного нарушения обязательства начисления. Миграция не включает внешнюю выплату автоматически и не является юридической гарантией дохода.

## Обязательство начисления

На каждый UTC-период и пользователя создается `core_accrual_obligations` с балансом до операции, ставкой и ожидаемыми `gross`, `Core` и `Wallet` суммами. `run_daily_core_accrual` в одной транзакции создает obligation, `daily_core_accruals` и изменения Core/Wallet; повторный запуск защищен уникальным периодом и пользователем.

`detect_core_obligation_breaches(now())` переводит pending obligation в `breached`, если после 24-часового grace window нет settled записи. Он также проверяет settled запись на расхождение сумм и пишет событие в `core_obligation_breaches`/представление `core_obligation_breach`. Расхождение фиксируется причиной и временем breach, а не исправляется задним числом.

## Неприкосновенность Core

Триггер `trigger_guard_core_balance_integrity` запрещает прямое уменьшение `core_accounts.balance`. Разрешение на уменьшение действует только внутри `complete_core_redemption_request` через transaction-local setting. Во время активного redemption блокируются новые положительные системные изменения этого Core; обычные пропуски заданий не меняют баланс.

## Redemption API и worker boundary

- `core_redemption_requests` хранит `eligible → requested → reserved → processing → paid/failed`, сумму и `core_balance_before`, сеть, подтвержденный адрес, cooling period, idempotency key, попытки, tx hash и ошибки.
- `redeem_core_after_breach` проверяет auth user, вызывает breach detector, блокирует breach и Core, фиксирует полный текущий остаток и возвращает idempotent request.
- `POST /api/core/redemption/request` требует явного подтверждения адреса (`confirmAddress`) и создает или возвращает такой request; текущий операторский cooling period по умолчанию — 24 часа.
- `GET /api/core/redemption/status` возвращает историю текущего пользователя без кеширования.
- Service-role worker использует `claim_core_redemption_request`, затем внешний payout и `complete_core_redemption_request` либо `fail_core_redemption_request`. Ошибка остается retryable и не отменяет право пользователя.

Внешний blockchain provider, подпись транзакций и фактическая отправка не входят в web request: `lib/coreRedemptionWorker.ts` задает отдельную границу worker с retry-safe `failed` состоянием. Worker обязан запускаться отдельным процессом с аварийной остановкой.

## Treasury, лимиты и rollout

`core_redemption_liability`, `core_redemption_coverage` и `treasury_liability_coverage` учитывают Core-redemption liability вместе с Wallet liability и последним снимком резерва. `refresh_core_emission_safety` автоматически включает `system_emissions_paused`, если зафиксированный резерв ниже совокупного liability; `core_redemption_controls` хранит одну сеть, лимит запроса, дневной лимит, cooling period, KYC/AML gates и worker/system-emission pause. Операционная реализация должна разделить cold treasury и hot payout wallet, добавить реальные KYC/AML-проверки и kill switch worker. При недостаточном покрытии нужно остановить новые системные эмиссии; неподтвержденная гарантия не показывается.

Текст «Core можно забрать при нарушении выплаты» разрешается в UI только после feature flag, проверки покрытия, юридического заключения и допуска оператора. До этого API и таблицы служат внутренним safeguard/операционным контуром.

## Проверки перед включением

1. Миграции применяются на staging и проверяют trigger на прямое уменьшение, idempotency и права RPC.
2. Детерминированные тесты проверяют 24-часовой breach, mismatch obligation, атомарность accrual и повторный/failed payout.
3. Worker запускается в dry-run на одной сети с журналом попыток и ручной сверкой reserve snapshot.
4. Только после юридического/операционного допуска включается пользовательский feature flag и UI-текст гарантии.
