# Wallet Crypto Rails Plan

Статус: канонический продуктовый план внешних пополнений и выводов, 2026-08-02. Native TON deposit реализован; кодовый срез ограниченного native TON withdrawal реализован, remote migration применена и сверена. Пользователь подтвердил успешный ручной mainnet withdrawal 2026-08-02; расширенные failure-сценарии и операционный hardening остаются отдельным этапом до массового вывода.

Текущий реализованный срез: только TON, mainnet по умолчанию, доступ только авторизованным пользователям, ввод суммы в TON, snapshot курса, `1%` service fee сверху, фиксированный network fee reserve, atomic Wallet reserve, idempotency, серверная подпись через `@ton/ton` и статусы `funds_reserved → broadcasting → broadcast`. При неопределённом результате отправки средства не возвращаются автоматически и запрос переводится в `manual_review`; reconciliation, `confirmed` worker, cooling/address history, coverage gate и production custody остаются следующим обязательным шагом.

Readiness-диагностика различает выключенный feature flag, отсутствующий mnemonic и некорректное число mnemonic-слов, не раскрывая сам секрет. Server env также нормализует внешние одинарные/двойные кавычки, чтобы значения, вставленные в deployment dashboard как `"true"` или `"word ... word"`, читались так же, как соответствующие значения из локального `.env`.

Для mainnet-работы серверу нужны `TON_WITHDRAWAL_ENABLED=true`, `TON_WITHDRAWAL_NETWORK=mainnet`, `TON_WITHDRAWAL_MNEMONIC` и небольшой запас TON на derived operating wallet. Доступ закрыт обычной авторизацией и feature flag; allowlist не используется. Обязательны малый `TON_WITHDRAWAL_MAX_TON` и готовая emergency pause через `TON_WITHDRAWAL_ENABLED=false`. Необязательные настройки: `TON_WITHDRAWAL_SOURCE_ADDRESS`, `TON_WITHDRAWAL_TONCENTER_URL`, `TONCENTER_API_KEY`, `TON_WITHDRAWAL_MIN_TON`, `TON_WITHDRAWAL_MAX_TON`, `TON_WITHDRAWAL_NETWORK_FEE_ESTIMATE_TON`, `TON_WITHDRAWAL_NETWORK_FEE_FLOOR_TON`, `TON_WITHDRAWAL_SERVICE_FEE_PERCENT`.

## 1. Порядок развития

1. Закрыть полный контур `native TON deposit → Wallet → native TON withdrawal` для авторизованных пользователей с малым лимитом и ручным контролем.
2. Подключить `USDT Jetton` в TON для пополнения и вывода.
3. Выбрать одну следующую пару `asset + network` по реальному спросу и операционной готовности.
4. Подключать последующие сети через единый adapter contract и отдельный risk review.

Несколько сетей не запускаются одновременно. Bridge, swap и автоматическая конвертация активов являются отдельными продуктами.

## 2. Native TON withdrawal MVP

Пользователь может задать сумму либо в USD-эквиваленте Wallet, либо в TON; второе поле пересчитывается по текущему курсу. При подтверждении фиксируются rate snapshot, сумма TON, списание Wallet, сервисная комиссия и резерв network fee.

Базовый flow:

```text
requested
→ address_confirmed
→ funds_reserved
→ queued
→ broadcast
→ confirmed
```

Терминальные альтернативы: `cancelled`, `expired`, `failed`, `manual_review`, `refunded`.

Обязательные свойства:

- atomic reserve доступного Wallet до отправки;
- idempotency key на запрос и каждую попытку;
- TON address validation, явное повторное подтверждение и cooling period после смены адреса;
- per-user, daily и aggregate payout limits;
- network, amount, rate, fees, tx hash, seqno/query id и полный audit trail;
- reconciliation scanner исходящих транзакций;
- возврат ровно один раз при окончательной ошибке до успешного broadcast/settlement;
- manual review и emergency pause при расхождении ledger, abuse-сигнале или недостаточном покрытии.

## 3. Комиссии и лимиты

Рабочее решение пользователя: сервисная комиссия добавляется сверху и составляет `1%`, network fee оплачивается отдельно.

Точная network fee заранее не гарантируется. До broadcast система:

1. получает доступную оценку комиссии;
2. резервирует `max(estimate × 2, configured_network_fee_floor)`;
3. показывает пользователю максимальную сумму списания;
4. после подтверждения фиксирует фактический fee и освобождает неиспользованный резерв.

Минимальная сумма вывода, суточный лимит пользователя и общий payout limit — отдельные параметры. Их нельзя подменять «минимальной комиссией»; значения утверждаются по тестовым транзакциям, покрытию и стоимости поддержки до включения worker.

## 4. Адрес и custody

Для закрытого тестового MVP подтверждено использование существующего TON operating address, который уже принимает депозиты. Это допустимо только как временный ограниченный hot-wallet режим:

- на адресе хранится не больше утверждённого операционного лимита;
- избыток регулярно переводится в отдельный основной резерв;
- worker не имеет доступа к остальным treasury-активам;
- действуют малые разовые/суточные лимиты и emergency pause.

Таким образом, первая версия использует «тот же адрес», но этот адрес не должен оставаться неограниченным основным резервом. До публичного или существенного объёма обязательны отдельный cold treasury и ограниченный hot payout wallet; allowlist не является частью текущего доступа.

Ключ в server `.env` допустим только для локального/закрытого теста: он не попадает в клиент, логи или git. Для production нужен KMS/Vault либо отдельный signing service, ротация и операционная процедура восстановления.

## 5. Ликвидность

Вывод подчиняется `coverage_ratio` и светофору из master plan:

- green — автоматическое исполнение в пределах лимитов;
- yellow — прозрачная очередь или заранее известный срочный режим;
- red — увеличенная очередь, manual review и остановка новых выводимых Wallet-обязательств.

Условия созданного запроса не меняются задним числом. Уже начисленный Wallet не уменьшается из-за смены режима.

## 6. Добавление asset + network

Для каждой пары отдельно задаются:

- deposit и payout addresses, memo/comment или token wallet;
- decimals, asset code и отображение курса;
- scanner/indexer, finality и duplicate/late transaction policy;
- fee estimation, минимумы и лимиты;
- provider fallback и reconciliation;
- contract allowlist и проверка master contract для Jetton;
- manual review, pause и incident runbook.

Для `USDT Jetton` нельзя определять актив только по названию или symbol: проверяются master contract, token wallet derivation, decimals и `transfer_notification`.

## 7. Критерии допуска native TON withdrawal

- Native TON deposit подтверждён на целевом окружении и ledger сходится с chain.
- Проведены success, duplicate, insufficient balance, bad address, timeout и final failure сценарии.
- Неиспользованный fee reserve освобождается, окончательная ошибка возвращает Wallet один раз.
- Настроены авторизация, feature flag, малые лимиты, coverage gate, monitoring и ручная остановка.
- Пользователь видит курс, обе суммы, полный fee, статус и explorer link до/после подтверждения.
- Custody и ответственный оператор явно определены.

Связанные документы: `TON_DEPOSIT_MVP_PLAN.md`, `OPEN_ABUNDANCE_MASTER_PLAN.md`, `MASTER_KANBAN.md`.
