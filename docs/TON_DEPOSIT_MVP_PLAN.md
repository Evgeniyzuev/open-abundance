# TON Deposit MVP

Статус: план первого проверяемого вертикального среза.

## Текущий статус реализации

- Реализованы migration/RPC для TON invoices, chain events и идемпотентного `crypto_deposit` settlement.
- Реализованы `POST/GET /api/wallet/deposits/ton`, `GET /api/wallet/deposits/ton/[depositId]` и защищённый scanner endpoint `GET/POST /api/internal/ton/deposits/scan`.
- Wallet UI показывает QR, адрес, обязательный comment и polling статуса; TON deposits попадают в Wallet history.
- Mainnet TON/USD quote подключён через официальный DIA Asset Quotation API. Scanner принимает только положительный TON quote с корректным asset identity и source timestamp не старше 300 секунд; stale/unavailable quote оставляет event в `awaiting_rate`, который автоматически повторно обрабатывается следующим scan.
- Migration `20260728130000_ton_deposit_mvp.sql` применена к remote Supabase. Remote migration history содержит `20260728130000`, а `ton_deposit_config`, `ton_chain_events` и `ton_price_quotes` подтверждены read-only REST-запросами с HTTP `200`. Рабочий способ push — linked CLI с явным `--password` из `POSTGRES_PASSWORD`; он зафиксирован в `docs/DEVELOPMENT_RULES.md`.
- Первый mainnet deposit обработан ручным scanner run: `0.1 TON` зачислены один раз как `$0.15`, invoice получил `credited`, chain event связан с Wallet ledger. Migration `20260728210000_ton_deposit_scanner_cron.sql` локально готова, но ещё не применена к remote: она создаёт короткий Cron job только при появлении invoice, делает до 10 проверок поиска перевода с интервалом 10 секунд, останавливается после зачисления или переводит invoice в `expired`, а application URL/scanner secret хранит в Supabase Vault без секрета в Git.
- Recovery invoice, `ton_proof`, withdrawals и mainnet signing остаются следующими этапами.

Для первой проверки в окружении задаются:

```text
TON_DEPOSIT_NETWORK=mainnet
TON_DEPOSIT_ADDRESS=<адрес mainnet reserve wallet>
TONCENTER_API_URL=https://toncenter.com/api/v2
TONCENTER_API_KEY=<optional TON Center key>
TON_SCANNER_SECRET=<generated 32-byte server secret>
DIA_TON_PRICE_URL=<optional override; default is the official Ton assetQuotation endpoint>
DIA_TON_PRICE_MAX_AGE_SECONDS=300
```

Scanner вызывается только server-to-server запросом с заголовком `x-ton-scanner-secret`. Новый `waiting` invoice запускает для общей очереди короткий burst-job: первый job делает scan сразу и затем каждые 10 секунд, а invoice, добавленный в уже работающую очередь, попадает в следующий тик не позднее чем через 10 секунд. Каждый invoice получает не более 10 попыток поиска перевода. Повторное открытие того же действующего invoice обновляет его expiry и сбрасывает его окно; когда активных окон не остается, общий job сам удаляется. Если перевод уже обнаружен, но DIA rate временно недоступен, invoice не отклоняется: job продолжает settlement до безопасного зачисления. Постоянного глобального polling job нет. Application URL и scanner secret хранятся зашифрованными в Supabase Vault и настраиваются service-role RPC `configure_ton_deposit_scanner`; секрет не попадает в migration history или Git.

## Решения

- Пилот работает только для закрытого allowlist пользователей. Юридические, KYC/AML и Travel Rule интеграции не входят в технический scope пилота и не являются gate для разработки.
- Первый актив — нативный Toncoin (`TON`) в сети TON. USDT jetton добавляется вторым этапом после проверки native deposit pipeline.
- Fireblocks и другой внешний custody provider в MVP не используются.
- Abundance читает блокчейн через server-side TON chain adapter. Первая реализация использует TON Center mainnet API; интерфейс должен позволять без изменения бизнес-логики переключиться на собственный TON Center/liteserver.
- Первый срез использует один общий deposit wallet и уникальный invoice ID в comment/forward payload. Это дешевле и проще для проверки полного потока, чем отдельный wallet contract на каждого пользователя.
- Приватный ключ deposit wallet не нужен приложению для обнаружения и зачисления депозитов. Он хранится отдельно и не добавляется в Supabase, Vercel или репозиторий.
- USD-сумма фиксируется по TON/USD quote на момент обработки finalized transfer. Основной источник mainnet — официальный DIA Asset Quotation endpoint для native Toncoin; DIA quote содержит USD price и source timestamp. Quote сохраняется для каждого валидного finalized transfer, включая `unmatched`. Для mainnet hardcoded rate запрещён: при недоступном, некорректном или старом quote event остаётся `awaiting_rate`, а следующий scan сначала повторно обрабатывает такие events.
- Chainlink оставлен как возможный второй адаптер после появления и проверки официального TON/USD feed: в текущем каталоге Chainlink не подтверждён отдельный TON/USD Data Feed, поэтому он не используется как фиктивный fallback.

## Один кошелек и разные адреса

В TON один seed/public key действительно может управлять несколькими адресами через разные `subwallet_id`, но каждый адрес является отдельным wallet contract:

- у него отдельные balance, `seqno`, история и состояние deployment;
- средства между subwallet не объединяются автоматически;
- для отправки или sweep с каждого адреса нужны deployment и TON на gas;
- единый баланс существует только в off-chain интерфейсе, который суммирует эти wallet contracts.

Поэтому доступны две модели:

1. **Один адрес + invoice ID.** Все средства сразу оказываются в одном wallet; пользователь обязан отправить уникальный comment. Это минимизирует deployment, monitoring и sweep fees.
2. **Отдельный адрес пользователя.** Адрес однозначно определяет пользователя, но каждый subwallet нужно отслеживать, снабжать gas и периодически sweep-ить.

Для первого среза выбирается модель 1. QR/deep link должен автоматически подставлять address, TON amount и invoice ID, чтобы пользователь не копировал comment вручную. Депозит с отсутствующим или неизвестным invoice ID не теряется: он записывается как `unmatched` для восстановления.

После проверки settlement pipeline модель атрибуции можно заменить на per-user addresses или self-hosted processor вроде Bicycle. Таблицы chain events, Wallet ledger и атомарный settlement RPC при этом не меняются.

## Привязка внешнего адреса

Успешный finalized-перевод с уникальным invoice ID позволяет сохранить адрес отправителя как `observed` для этого пользователя. Это доказывает, что кто-то смог инициировать перевод с адреса, но не всегда доказывает личное и исключительное владение: custodial exchange или общий сервисный wallet может отправлять средства нескольких людей.

Поэтому используются два уровня:

1. `observed_by_deposit` — адрес впервые замечен в корректном invoice deposit;
2. `verified_by_ton_proof` — пользователь подключил wallet через TON Connect и подписал одноразовый server nonce.

Только `verified_by_ton_proof` используется как надежный fallback, если следующий депозит пришел без invoice. Один normalized address может быть verified только для одного Abundance user. Попытка использовать invoice одного пользователя с адреса, уже verified для другого, получает `identity_conflict` и не начисляет Wallet автоматически.

Правила входящих переводов:

- корректный invoice всегда определяет получателя, даже если адрес еще не привязан;
- корректный invoice с нового адреса создает `observed` association и предлагает пользователю подтвердить wallet через TON Connect;
- отсутствующий invoice с verified-адреса начисляется его владельцу с причиной `address_fallback`;
- отсутствующий invoice с unknown/observed-адреса остается `unmatched`;
- пользователь может открыть unmatched recovery по tx hash;
- рекомендуемый путь — подтвердить тот же адрес через `ton_proof` без дополнительной on-chain комиссии;
- альтернативный путь для закрытого пилота выдает одноразовый recovery invoice, связанный с конкретными user ID и unmatched event;
- следующий перевод с recovery invoice и с того же normalized source address может быть на любую положительную сумму;
- settlement в одной DB-транзакции начисляет новый перевод и выбранный unmatched transfer, используя для каждого его собственный finality rate snapshot, помечает claim использованным и не допускает повторное начисление;
- перевод recovery invoice с другого source address не подтверждает предыдущий депозит.

Recovery-инвойс можно исполнить автоматически только когда исходный address ранее не использовался другими пользователями, не связан с конфликтующим claim и не классифицирован как shared/custodial/highload wallet. Сам по себе повторный перевод не доказывает исключительное владение: один exchange/hot wallet может отправлять средства нескольких пользователей. Поэтому сомнительный source получает `manual_review`, а recovery для вывода с биржи через source address не гарантируется.

Finalized transfer нельзя отклонить стандартным wallet задним числом. В первом срезе неизвестные переводы не возвращаются: они остаются `unmatched` до восстановления, а резервный on-chain balance не меняется. В reserve accounting их сумма учитывается как `unclaimed_customer_funds`, исключается из свободной ликвидности и не освобождается по таймауту в рамках MVP.

## Поток пополнения

1. Пользователь нажимает `Deposit`, выбирает `Toncoin · TON` и при необходимости вводит ожидаемую сумму.
2. `POST /api/wallet/deposits/ton` возвращает уже действующий `waiting` invoice пользователя и обновляет его окно проверки либо, если такого нет, создает новый криптографически случайный invoice ID. Один invoice предназначен для одного перевода; после `credited` или `expired` создается новый. API возвращает:
   - deposit address;
   - обязательный comment/invoice ID;
   - QR/deep link;
   - ожидаемую сумму;
   - срок invoice;
   - текущий status.
3. Создание первого `waiting` invoice запускает защищённый scanner сразу и затем каждые 10 секунд. Новый invoice в уже работающей очереди проверяется на следующем тике. Для каждого invoice выполняется максимум 10 попыток; повторный запрос действующего invoice продлевает и перезапускает его окно, а без найденного перевода invoice становится `expired`.
4. Для каждого входящего native transfer scanner обязан:
   - дождаться masterchain finality;
   - проверить destination deposit wallet и положительный amount в nanoTON (`10^-9 TON`);
   - извлечь normalized source address;
   - разобрать invoice ID из text comment;
   - отклонить bounced/failed trace;
   - сохранить raw amount в base units без JavaScript floating point.
5. После finality worker получает актуальный DIA TON/USD quote, проверяет asset identity и свежесть source timestamp, сохраняет неизменяемый rate snapshot и вызывает `settle_ton_deposit(chain_event_id)`. RPC в одной PostgreSQL-транзакции:
   - блокирует chain event, invoice и `wallet_accounts`;
   - повторно проверяет, что event finalized и еще не settled;
   - конвертирует nanoTON в TON и рассчитывает USD через сохраненный rate;
   - округляет результат до точности Wallet в 2 знака и увеличивает Wallet на рассчитанную USD-сумму;
   - создает `wallet_ledger.operation_type = 'crypto_deposit'`;
   - сохраняет `settled_usd_amount`, курс, provider, timestamp курса и USD-аудит в chain event/ledger metadata;
   - переводит invoice и event в `credited`.
6. Повторный scan, повторный webhook/poll или параллельный worker возвращают уже созданный результат и не начисляют Wallet второй раз.
7. Просроченный invoice с корректным уникальным ID все равно принимается, но помечается `credited_late`. Неизвестный ID получает `unmatched` и не изменяет Wallet. Если корректный invoice отправлен с суммой, отличающейся от ожидаемой, система начисляет фактически полученную сумму и сохраняет статус `credited_amount_mismatch`.

## Данные и интерфейсы

Новые серверные сущности:

- `ton_deposit_config` — network, deposit address, price source, enabled;
- `ton_deposit_invoices` — user, invoice ID, expected amount, address, status, expiry;
- `ton_invoice_scan_windows` — число попыток и состояние короткого Cron window для invoice;
- `ton_deposit_recovery_claims` (следующий этап) — user, unmatched event, recovery nonce, expected source, status и expiry;
- `ton_user_wallets` — user, normalized address, observed/verified status и verification metadata;
- `ton_price_quotes` — TON/USD rate, provider, source timestamp и capture time;
- `ton_chain_cursors` — последний обработанный finalized block/transaction cursor;
- `ton_chain_events` — tx hash, logical time, message index, sender, receiver, raw nanoTON, invoice ID и settlement status.

Уникальность chain event задается комбинацией network, transaction hash, logical time и message index. Клиент имеет только read-доступ к своим invoices и привязанным адресам; config, quotes, cursors и chain events доступны только service role.

API первого среза:

- `POST /api/wallet/deposits/ton`;
- `GET /api/wallet/deposits/ton`;
- `GET /api/wallet/deposits/ton/[depositId]`;
- scanner endpoint is internal and secret-protected.

Все ответы используют `NO_STORE_HEADERS`, а суммы передаются строками. `WalletApp` получает локализованное Deposit modal с address, обязательным comment, QR, copy actions и статусами `waiting`, `detected`, `finalizing`, `credited`, `unmatched`, `expired`.

## Стратегия комиссий

### Пополнение

- Blockchain fee платит отправитель в своем TON wallet; native transfer требует меньше contract/message processing, чем jetton transfer.
- Abundance показывает ориентировочную fee, но не добавляет ее к Wallet и не обещает точное значение, поскольку ее рассчитывает wallet отправителя.
- Deposit fee Abundance в первом срезе равна нулю.
- Общий deposit address не требует deployment/sweep с каждого пользовательского subwallet, поэтому Abundance не несет отдельную gas fee на каждый депозит.

### Будущий вывод

В интерфейсе всегда раздельно показываются:

- сумма криптовалюты получателю;
- комиссия Abundance `1%`;
- ожидаемая blockchain fee;
- максимальное итоговое списание Wallet.

Перед подтверждением withdrawal worker эмулирует готовое TON message и получает fee breakdown. Wallet временно резервирует `principal + 1% + max_network_fee`. После финализации:

- списывается фактическая network fee по trace;
- неиспользованный fee reserve автоматически возвращается в Wallet;
- если фактическая fee выше резерва, разницу оплачивает Abundance;
- quote пользователя задним числом не увеличивается.

Для массовых выводов используется Highload Wallet v3 и batching до 254 сообщений. Выводы собираются в короткое окно, пока это не нарушает обещанный срок, чтобы распределить external-message fee между несколькими выплатами.

Если позже включаются per-user deposit addresses, sweep выполняется только выше настраиваемого экономического порога. Малые остатки не sweep-ятся, пока сумма не покрывает gas с запасом.

## Проверка и acceptance criteria

Обязательные детерминированные тесты:

- invoice принадлежит только авторизованному пользователю;
- правильный finalized mainnet Toncoin deposit начисляет Wallet ровно один раз;
- повторный scan и параллельный settlement не создают второе начисление;
- pending/confirmed, но не finalized trace не изменяет Wallet;
- missing/unknown invoice попадает в `unmatched`;
- `unmatched` amount учитывается как `unclaimed_customer_funds` и не попадает в available reserve;
- missing invoice с `verified_by_ton_proof` адреса начисляется правильному пользователю;
- одноразовый recovery invoice с того же допустимого address атомарно начисляет новый перевод и выбранный unmatched deposit ровно по одному разу;
- восстановленный и новый переводы рассчитываются по собственным finality rate snapshots;
- повторное использование recovery invoice не создает начислений;
- recovery invoice с другого, конфликтующего или shared/custodial address не начисляет старый unmatched deposit автоматически;
- address, verified другим пользователем, создает `identity_conflict`;
- invalid/expired/replayed `ton_proof` отклоняется;
- malformed payload и bounced trace не начисляют Wallet;
- amount сохраняется в nanoTON и точно конвертируется в TON/USD;
- сумма, отличающаяся от ожидаемой, начисляется по факту и получает `credited_amount_mismatch`;
- недоступный или устаревший rate оставляет депозит в `awaiting_rate`;
- поздний корректный invoice получает `credited_late`;
- history показывает сумму, сеть, tx hash и время финальности.

Ручной mainnet сценарий:

1. Открыть Deposit в Wallet.
2. Получить address, invoice ID и QR.
3. Отправить небольшую сумму mainnet Toncoin через TON wallet.
4. Увидеть `detected/finalizing`.
5. Не позднее следующего 10-секундного scan после finality увидеть `credited`.
6. Обновить страницу и повторно запустить scanner — баланс не меняется второй раз.

## Не входит в первый срез

- withdrawals;
- USDT и другие jettons;
- per-user TON wallet contracts и автоматические sweeps;
- mainnet hot-wallet signing;
- другие сети и активы;
- Fireblocks/MPC;
- юридические, KYC/AML и Travel Rule процессы;
- публичный запуск за пределами закрытого allowlist.
