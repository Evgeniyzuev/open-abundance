# Core Redemption Safeguard (legacy, deprecated)

Статус: legacy-контур. С 2026-07-31 действует абсолютный принцип: Core строго неснижаем и никогда не redeem-ится. Описанные ниже breach/redemption migration, RPC, API и worker не являются текущим продуктовым контрактом, не должны включаться feature flag или операционным допуском и подлежат отключению/удалению. Новая миграция `20260731120000_core_strictly_non_decreasing.sql` и серверные блокировки добавлены в рабочую копию; применение к staging/production остаётся отдельным шагом.

## Текущее решение

Core не уменьшается ни при breach, невыплате, ошибке, пропуске, quality-gate, redemption или любом другом событии. Актуальная техническая защита должна только отклонять попытку уменьшения и сохранять возможность положительных начислений. Остальной текст ниже сохранён как историческое описание устаревшего решения.

## Цель и границы

Историческая версия плана допускала уменьшение Core через breach-only redemption после нарушения обязательства начисления. Это решение отменено: Core строго неснижаем, а миграция не является действующим пользовательским обещанием или юридической гарантией дохода.

## Обязательство начисления

На каждый UTC-период и пользователя создается `core_accrual_obligations` с балансом до операции, ставкой и ожидаемыми `gross`, `Core` и `Wallet` суммами. `run_daily_core_accrual` в одной транзакции создает obligation, `daily_core_accruals` и изменения Core/Wallet; повторный запуск защищен уникальным периодом и пользователем.

`detect_core_obligation_breaches(now())` переводит pending obligation в `breached`, если после 24-часового grace window нет settled записи. Он также проверяет settled запись на расхождение сумм и пишет событие в `core_obligation_breaches`/представление `core_obligation_breach`. Расхождение фиксируется причиной и временем breach, а не исправляется задним числом.

## Неприкосновенность Core

Исторический триггер `trigger_guard_core_balance_integrity` защищал `core_accounts.balance`, но старая transaction-local возможность уменьшения через `complete_core_redemption_request` отменена. Актуальный триггер запрещает любое уменьшение без исключений и не блокирует положительные начисления.

## Redemption API и worker boundary

- `core_redemption_requests` хранит `eligible → requested → reserved → processing → paid/failed`, сумму и `core_balance_before`, сеть, подтвержденный адрес, cooling period, idempotency key, попытки, tx hash и ошибки.
- Исторический `redeem_core_after_breach` проверял auth user, вызывал breach detector и создавал idempotent request; сейчас RPC отклоняет любой вызов.
- Исторический `POST /api/core/redemption/request` требовал подтверждения адреса; теперь endpoint возвращает `410 Gone`, потому что Core не redeem-ится.
- `GET /api/core/redemption/status` может сохранять read-only историю legacy-запросов без кеширования, но новые запросы не создаются.
- Legacy service-role worker отключен; внешний payout для Core запрещен.

Внешний blockchain provider, подпись транзакций и фактическая отправка не входят в web request: `lib/coreRedemptionWorker.ts` задает отдельную границу worker с retry-safe `failed` состоянием. Worker обязан запускаться отдельным процессом с аварийной остановкой.

## Treasury, лимиты и rollout

Исторические `core_redemption_liability` и `core_redemption_coverage` больше не являются продуктовой задолженностью: Core не redeem-ится. `treasury_liability_coverage` учитывает только действующие Wallet-обязательства; при недостаточном покрытии останавливаются новые Wallet-обязательства и соответствующие эмиссии.

Текст о возможности забрать Core запрещен в UI. Legacy API и таблицы сохраняются только для миграционной истории и не должны использоваться для уменьшения Core или внешних выплат.

## Проверки перед включением

1. Перед применением миграции на staging проверить, что любое уменьшение Core отклоняется, а положительные начисления проходят.
2. Детерминированными тестами подтвердить отказ legacy redemption RPC/API и отсутствие внешнего payout.
3. Legacy worker не запускать; старые таблицы и статусы оставить только read-only для аудита и последующей очистки.
