# TON Deposit MVP

Статус: реализован основной вертикальный срез пополнения Wallet нативным Toncoin в mainnet; 2026-08-01 пользователь подтвердил, что первая версия пополнения работает.

Этот файл остаётся implementation record native TON deposit. Следующий withdrawal и подключение assets/networks не расширяются здесь; канонический план — `WALLET_CRYPTO_RAILS_PLAN.md`.

## Архитектура

- Все пользователи отправляют TON на один резервный адрес.
- Пользователя определяет уникальный `invoice_code` в text comment перевода.
- Один постоянный Supabase Cron вызывает TON pipeline каждые 30 секунд.
- Scanner читает только транзакции новее сохранённого `ton_chain_cursors`.
- Если новых транзакций нет, scanner немедленно завершает проход: DIA, invoices и settlement в этом запросе не вызываются.
- Первый запуск при отсутствующем cursor сохраняет текущую вершину цепочки и не импортирует старую историю.
- `ton_chain_scan_leases` не допускает одновременную обработку одного адреса двумя scanner-запросами.
- Новый входящий перевод сначала сохраняется как неизменяемый `ton_chain_events`.
- Получение курса и зачисление выполняет отдельный worker через ограниченную очередь `ton_deposit_settlement_retries`.
- Один именованный Cron может отправить два независимых HTTP-запроса: scanner всегда, settlement worker — только когда в очереди есть due-запись.

Закрытие окна, вкладки или приложения не влияет на обработку. Пользователь не запускает scanner и не управляет его временем. В Deposit показывается только короткая подсказка: «Зачисления в среднем 2–5 минут.»

## Invoice

- Открытие Deposit выполняет только `GET /api/wallet/deposits/ton?active=true`.
- Invoice создаётся после нажатия «Сформировать invoice».
- Для одного пользователя допускается один активный invoice для пары `mainnet + TON`.
- Повторное открытие возвращает тот же адрес, QR и comment.
- Необязательная сумма хранится в nanoTON и включается в `ton://transfer` без floating point.
- Изменение суммы явно заменяет активный invoice; старый становится `cancelled`.
- Старый comment никогда не выдаётся другому пользователю.
- Поздний перевод по закрытому invoice не теряется и зачисляется как `credited_late`.
- Второй уникальный перевод с тем же comment — отдельный chain event и отдельное идемпотентное зачисление.

## Chain ingestion

Scanner:

1. Проверяет `TON_SCANNER_SECRET`.
2. Загружает mainnet reserve-wallet config.
3. Получает lease на 55 секунд.
4. Читает сохранённый logical-time cursor.
5. Пагинирует TON Center `getTransactions` до cursor через `previous_transaction`.
6. Обрабатывает только транзакции с `logical_time > cursor`.
7. Проверяет destination, положительный nanoTON amount, text comment и `bounced`/`aborted`.
8. Сохраняет подходящий перевод с уникальностью `(network, transaction_hash, logical_time, message_index)`.
9. Ставит успешный event в settlement queue, а rejected event помечает `failed`.
10. Продвигает cursor до самой новой безопасно просмотренной транзакции.

Существующий mainnet cursor не сбрасывается. Миграция также удаляет ровно 37 подтверждённых ошибочных historical backfill events из окна `2026-07-28 20:34:57–20:35:18 UTC`; при другом количестве миграция прерывается.

## Курс и зачисление

- Mainnet TON/USD запрашивается параллельно из DIA Asset Quotation API и CoinGecko `the-open-network`.
- Принимаются только положительные котировки не старше 5 минут с проверенной identity native TON.
- DIA остаётся primary. Если DIA недоступен, валидный CoinGecko quote используется как fallback.
- Если обе котировки доступны, но расходятся больше чем на 2%, автоматическое зачисление приостанавливается и settlement retry получает `price_provider_deviation`.
- Выбранный provider, обе цены, timestamps, отклонение и причина fallback сохраняются в `ton_chain_events.rate_metadata` и Wallet ledger metadata.
- Hardcoded fallback курса для mainnet запрещён.
- При недоступном или stale DIA очередь повторяет запрос с backoff: 15 секунд, 30 секунд, 1 минута, 2 минуты, затем 5 минут.
- После 12 неудачных попыток запись переходит в `manual_review`; chain event и деньги не удаляются.
- USD рассчитывается и округляется до 6 знаков.
- `wallet_accounts` и `wallet_ledger` сохраняют внутреннюю точность `numeric(30,12)`.
- `settle_ton_deposit(chain_event_id)` атомарно блокирует event, invoice и Wallet, создаёт ровно одну ledger-запись `crypto_deposit` и обновляет баланс.
- История Wallet содержит TON amount, USD amount, settlement rate, provider и transaction hash.

USDT пока отображается только справочно. Приём jetton требует отдельной проверки master/wallet и `transfer_notification`.

## Server configuration

```text
TON_DEPOSIT_NETWORK=mainnet
TON_DEPOSIT_ADDRESS=<mainnet reserve wallet>
TONCENTER_API_URL=https://toncenter.com/api/v2
TONCENTER_API_KEY=<optional>
TON_SCANNER_SECRET=<generated server secret, at least 32 characters>
DIA_TON_PRICE_URL=<optional override>
DIA_USDT_PRICE_URL=<optional override>
DIA_TON_PRICE_MAX_AGE_SECONDS=300
COINGECKO_TON_PRICE_URL=<optional override>
COINGECKO_API_KEY=<optional but recommended for production>
TON_PRICE_MAX_DEVIATION_PERCENT=2
```

Supabase Vault содержит:

- `ton_scanner_project_url`;
- `ton_scanner_secret`, совпадающий с `TON_SCANNER_SECRET` server environment.

RPC `configure_ton_deposit_scanner(project_url, secret)` обновляет оба секрета и пересоздаёт один job `open-abundance-ton-deposit-pipeline` с периодом 30 секунд. Отсутствующий Vault не создаёт бесконечные пользовательские ошибки: dispatch возвращает `null`, а статус конфигурации виден через `ton_deposit_scanner_status()`.

## API

- `POST /api/wallet/deposits/ton`
- `GET /api/wallet/deposits/ton`
- `GET /api/wallet/deposits/ton/[depositId]`
- `GET /api/wallet/deposits/quotes`
- `POST /api/internal/ton/deposits/scan` — internal, secret-protected
- `POST /api/internal/ton/deposits/settle` — internal, secret-protected

TON invoice API нормализует значения PostgREST `numeric` (`expected_amount_nano`, `amount_nano`, settlement amount и rate) в строки до формирования JSON. Клиентский форматтер также проверяет runtime-тип, поэтому числовой chain event не может обрушить Deposit modal.

Wallet history и общий server-side Supabase client используют принудительный `no-store`, чтобы новое ledger-зачисление не скрывалось устаревшим внутренним PostgREST GET.

Пользовательских `/check`, `/cancel`, `/resume`, scan runs и countdown больше нет.

## Миграции

- `20260728130000_ton_deposit_mvp.sql` применена к remote Supabase.
- `20260729130000_ton_deposit_usd_precision.sql` применена и поднимает точность settlement до 6 USD-знаков.
- `20260729190000_ton_invoice_persistent_scan_runs.sql` применена и, несмотря на историческое имя, заменяет per-invoice scan windows постоянным cursor-driven pipeline.
- `20260729220000_fix_ton_invoice_expiry_ambiguity.sql` исправляет неоднозначную ссылку `expires_at` при явной замене active invoice.
- `20260729223000_ton_price_provider_fallback_audit.sql` добавляет audit metadata для DIA/CoinGecko failover и сохраняет его в Wallet ledger.
- Новые миграции применяются только штатным linked Supabase CLI способом из `docs/DEVELOPMENT_RULES.md`.

Исправление UI от 2026-07-29 также нормализует timestamp криптодепозита до календарной даты в Wallet history и не допускает падения `Intl.DateTimeFormat` на повреждённом значении. DIA USDT endpoint использует регистрозависимый идентификатор `Ethereum` и при ошибочном custom URL повторяет запрос к официальному default endpoint.

## Acceptance criteria

- пустой 30-секундный scan не вызывает DIA и не читает invoices;
- scanner никогда не читает события старее или равные cursor;
- два параллельных scanner-запроса не обрабатывают адрес одновременно;
- новый перевод находится независимо от открытого приложения и наличия активного UI-сеанса;
- повторный scan или settlement не создаёт второе зачисление одного chain event;
- два разных перевода с одним comment сохраняются и зачисляются отдельно;
- bounced/aborted перевод не изменяет Wallet;
- недоступный DIA не теряет chain event и не продолжает blockchain polling ради курса;
- недоступный DIA использует свежий CoinGecko quote, а расхождение провайдеров больше 2% блокирует settlement;
- неизвестный comment сохраняется как `unmatched` и не изменяет Wallet;
- сумма хранится в nanoTON и точно конвертируется в TON/USD;
- Wallet history показывает фактическую сумму, курс и tx hash;
- UI не содержит кнопок запуска/повтора/отмены scanner и показывает «Зачисления в среднем 2–5 минут.».

## Не входит в первый срез

- withdrawals;
- USDT и другие jettons;
- per-user TON wallet contracts и sweeps;
- hot-wallet signing;
- другие сети и активы;
- Fireblocks/MPC.

## Следующий rail

Ограниченный native TON withdrawal использует тот же amount/rate UX, atomic Wallet reserve, fee settlement, idempotency и chain reconciliation. Затем подключается USDT Jetton в TON и только после него одна следующая сеть. Требования, custody boundaries и decision gates описаны в `WALLET_CRYPTO_RAILS_PLAN.md`.