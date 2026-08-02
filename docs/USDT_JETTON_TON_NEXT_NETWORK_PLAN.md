# USDT Jetton в TON и следующая сеть

Статус: decision-complete план активной карточки, 2026-08-02. Native TON deposit и ограниченный native TON withdrawal используются как эталон идемпотентности, Wallet reserve, scanner lease, settlement retry и manual review. В этом срезе реализуется полный USDT Jetton rail в TON; следующая сеть не включается до отдельного risk review.

## 1. Результат

Пользователь может:

1. открыть Wallet и выбрать `USDT · TON`;
2. получить invoice с адресом TON-кошелька резерва, master contract, Jetton wallet и обязательным comment;
3. отправить USDT Jetton с `decimals = 6`;
4. дождаться on-chain finality и увидеть USD-эквивалент в Wallet;
5. вывести USDT на TON-адрес с прозрачной комиссией, атомарным reserve Wallet и on-chain status.

Wallet хранит USD. Номинал USDT и комиссии сохраняются в chain-operation metadata и не подменяют Wallet ledger currency.

## 2. Безопасная граница

В allowlist принимается только официальный mainnet USDT Jetton master:

```text
EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
```

Перед обработкой каждого rail проверяются:

- сеть и master address;
- детерминированный `get_wallet_address(reserve_owner)`;
- сохранённое соответствие master → reserve Jetton wallet → reserve TON owner;
- opcode `transfer_notification = 0x7362d09c`;
- положительная raw-сумма в microUSDT и `decimals = 6`;
- корректный `forward_payload` и invoice code;
- bounce/aborted/finality;
- idempotency по `(network, master, transaction_hash, logical_time, message_index)`.

Нельзя принимать Jetton по symbol, имени, картинке или только по адресу Jetton wallet. Fake master/wallet, unknown comment и duplicate event не меняют Wallet.

## 3. Deposit

Отдельные `ton_usdt_*` tables не смешиваются с native TON tables. Invoice имеет срок 30 дней и статусный путь:

```text
waiting → detected → finalizing → finalized → credited
                                      ├→ credited_late
                                      ├→ credited_amount_mismatch
                                      ├→ awaiting_rate
                                      └→ unmatched
```

Scanner работает server-side через TON Center `getTransactions` по reserve Jetton wallet, с lease и monotonic `lt` cursor. Повторный scan безопасен. Settlement worker получает свежий USDT/USD quote, записывает rate metadata, затем одной RPC-транзакцией блокирует event/invoice/wallet, рассчитывает USD с точностью Wallet и создаёт один `crypto_deposit` ledger entry.

`forward_ton_amount` должен быть положительным, чтобы transfer notification дошёл до резервного owner. В UI показываются TON address owner, USDT master и comment; QR использует стандартный Jetton deep link.

## 4. Withdrawal

Вывод использует тот же ограниченный TON operating wallet и mnemonic, что и native TON rail, но отправляет Jetton transfer из детерминированного operating Jetton wallet. Внешнее сообщение содержит:

- raw USDT amount в microUSDT;
- destination TON owner address;
- response destination operating wallet;
- ненулевой `forward_ton_amount`;
- короткий comment с withdrawal id.

Перед broadcast:

1. проверяется quote USDT/USD и TON/USD;
2. резервируются payout amount, service fee `1%` и network fee reserve в USD;
3. создаются withdrawal и debit ledger атомарно;
4. используется idempotency key;
5. неизвестный результат broadcast переводится в `manual_review`, автоматический refund после отправки запрещён.

Для закрытого теста по умолчанию действуют малые лимиты. Mainnet flag и seed остаются только server-side.

## 5. API и конфигурация

Пользовательские routes:

- `GET/POST /api/wallet/deposits/usdt`;
- `GET /api/wallet/deposits/usdt/[depositId]`;
- `GET/POST /api/wallet/withdrawals/usdt`;
- `GET /api/wallet/withdrawals/usdt/[withdrawalId]`.

Internal routes, защищённые `TON_SCANNER_SECRET`:

- `POST /api/internal/ton/usdt/deposits/scan`;
- `POST /api/internal/ton/usdt/deposits/settle`.

Минимальные переменные:

```text
TON_USDT_ENABLED=true
TON_USDT_NETWORK=mainnet
TON_USDT_MASTER_ADDRESS=<allowlisted official master>
TON_USDT_DEPOSIT_OWNER_ADDRESS=<TON reserve owner>
TON_USDT_TONCENTER_URL=<optional>
TON_USDT_DECIMALS=6
TON_USDT_WITHDRAWAL_ENABLED=false
TON_USDT_WITHDRAWAL_MIN=1
TON_USDT_WITHDRAWAL_MAX=100
TON_USDT_NETWORK_FEE_ESTIMATE_TON=0.02
TON_USDT_NETWORK_FEE_FLOOR_TON=0.1
```

`TON_WITHDRAWAL_MNEMONIC` используется только server-side для withdrawal signer. Конфигурация из Supabase может хранить master/owner/derived wallet mapping, но не секреты.

## 6. Следующая сеть

Следующая сеть — отдельная пара `asset + network`, не часть первого USDT deployment. Кандидат по реальному спросу — `USDT / TRON (TRC-20)`, но выбор не фиксируется до gate:

- пройти TON USDT testnet и закрытый mainnet User QA;
- сверить chain events с Wallet ledger;
- подтвердить custody, fee reserve, reconciliation и pause runbook;
- собрать спрос минимум от первой когорты и сравнить операционную стоимость;
- отдельно утвердить adapter contract и новый master/contract allowlist.

Bridge, swap и параллельный запуск нескольких сетей запрещены текущим планом.

## 7. Acceptance criteria

- fake master и fake Jetton wallet не принимаются;
- notification с неправильным opcode, malformed payload, bounce или aborted не кредитует Wallet;
- одинаковый chain event, invoice или withdrawal не создаёт повторный ledger entry;
- два перевода с разными tx/hash и одним comment обрабатываются отдельно;
- unknown comment получает `unmatched` без изменения Wallet;
- raw USDT хранится в microUSDT, `decimals = 6`, USD округляется до Wallet precision;
- stale/unavailable/deviating quote оставляет event в retry, а не теряет средства;
- UI показывает network, master, owner address, comment, nominal amount, rate, fee и status;
- withdrawal с prepare failure возвращает reserve ровно один раз, broadcast-uncertainty → manual review;
- testnet full loop и ручной mainnet success/duplicate/fake/unknown/insufficient сценарии пройдены до включения массового доступа.

## 8. Current implementation status

- [x] decision-complete plan and next-network gate;
- [x] USDT schema, scanner, settlement and withdrawal code;
- [x] Wallet UI and translations; Wallet keeps the original four actions, opens a Gram (TON) / USDT (TON) method selector for deposit and withdrawal, and shows an available USDT rate separately from the withdrawal enablement gate.
- [x] typecheck/lint/build/contract checks; `pnpm test:usdt`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`; REST schema check returned HTTP 200. Bounded local HTTP smoke-check attempted once, but `next dev` was unavailable because of Windows `spawn EPERM`.
- [x] remote migration apply; `20260802140000_ton_usdt_jetton_rail.sql` applied and migration list verified.
- [ ] testnet and mainnet User QA; remains the next external gate before enabling real withdrawals.