# Mutual Credit & Internal Market Plan

Статус: канонический план mutual credit discovery, обновлён 2026-08-06. Settlement/review foundation реализован в коде внутреннего DB-only Marketplace; discovery остаётся отложенной read-model задачей и не влияет на выдачу до buyer/seller QA и отдельного допуска закрытой beta.

## 1. Концепция

Пользователь, который сам покупает полезные продукты и обучение у других, получает ограниченное дополнительное распространение собственных предложений. Цель — приблизить дельту взаимного продвижения к балансу и увеличивать максимально возможный **легитимный** GMV, не создавая награду за искусственный оборот.

```text
покупаю у других
→ получаю временный capped discovery boost
→ мои релевантные качественные предложения видят чаще
→ совершаю продажи
→ boost постепенно возвращается к нейтральному
```

Внутренний GMV не равен внешней ликвидности и сам по себе не увеличивает Treasury. Он повышает полезность Wallet; ликвидностью являются только реальные внешние активы и фактическая выручка/комиссия системы.

## 2. Баланс взаимности

Базовый private signal:

```text
mutual_market_balance(window) = settled_spent - settled_earned
```

Учитываются только completed settlements в rolling window, без возвращённой или оспоренной суммы. Суммы нормализуются в одной расчётной единице по зафиксированному deal rate.

Правила:

- положительный balance даёт мягкий boost;
- отрицательный balance нейтрален и не штрафуется;
- boost ограничен, сглажен и со временем уменьшается;
- одна крупная покупка не поднимает весь каталог;
- signal не публикуется как рейтинг личности;
- Core/Wallet-награды за balance или raw GMV не выдаются.

## 3. Ranking contract

```text
listing_score =
  relevance_and_eligibility
  + freshness
  + quality_and_review_confidence
  + log(1 + legitimate_completed_sales) × sales_weight
  + capped_mutual_balance_boost
  - risk_or_report_penalty
```

`relevance_and_eligibility` и качество доминируют над mutual boost. Алгоритм дополнительно учитывает unique counterparties, return/dispute rate, повторное качество, концентрацию показов и diversity. Коммерческий boost маркируется и не может скрывать нерелевантное или небезопасное предложение.

Исключаются self-deals, связанные аккаунты, circular trading, искусственное дробление, reciprocal rings, сделки без deliverable и аномальные price/rate patterns. Подозрительный оборот не создаёт ни signal, ни challenge/skill proof до review.

## 4. Продуктовый цикл

Для покупателя: найти релевантное предложение → принять условия → безопасный settlement → получить результат → оставить review → при наличии своих listings получить временный boost.

Для продавца: создать качественную карточку → завершить сделку → получить Wallet → покупать у других → поддерживать взаимный внутренний спрос.

Для системы: измерять полезные settled сделки, фактическую комиссию, возвраты/споры, концентрацию и incrementality boost. Рост показов без прироста legitimate completion не считается успехом.

## 5. Статус реализации

Реализован технический фундамент:

- Phase 1: `user_artifacts`, `wallet_ledger`, Wallet-to-Wallet и Wallet → Core;
- Phase 2: `marketplace_listings`, create/list/cancel и Market UI;
- internal Phase 3/4: минимальный `marketplace_escrows` (только lifecycle/key state), hold/release/refund, delivery/confirm/dispute timers и immutable buyer reviews в migration `20260806120000_marketplace_internal_escrow.sql`.
- Отложено: `marketplace_user_balances`, `marketplace_user_counterparties` и отдельные writable ranking counters. Они не нужны для settlement и будут заменены view/materialized read model после QA.

Оставшиеся gates текущего Marketplace:

- remote migration apply и REST schema verification;
- SQL/API concurrency/invariant checks и buyer/seller User QA;
- buyer review UI и окончательное включение ranking после QA.

Mutual credit считается в shadow mode: окно 90 дней, минимум два уникальных контрагента, только положительный `spent - earned`, cap `+10%`, без отрицательного штрафа. До закрытой beta ranking не изменяет выдачу.

## 6. Порядок реализации

1. Подтвердить remote migration и пройти Marketplace buyer/seller User QA.
2. Построить один rolling 90-day read model по completed deals: `spent`, `earned`, eligible amount и unique counterparties; не создавать отдельные source tables без доказанной необходимости.
3. Считать boost в shadow mode и сравнить с выдачей без него.
4. Провести ограниченный closed-beta pilot с cap и kill switch.
5. Включить ranking только если растут legitimate completions/GMV без роста returns, disputes и concentration.

## 7. Decision gates и метрики

До реализации определить rolling window, cap, smoothing/decay, минимальное число контрагентов, комиссию системы и dispute SLA. Значения хранятся как versioned configuration.

Главные метрики: legitimate settled GMV, completion rate, unique buyers/sellers, repeat purchases, return/dispute/wash rate, seller exposure concentration, incremental conversions и фактически полученная комиссия. `spent - earned → 0` является направлением балансировки возможностей, а не обязательным индивидуальным долгом пользователя.

Связанные документы: `MARKETPLACE_ESCROW_PLAN.md`, `TRUST_RECIPROCITY_MARKET_PLAN.md`, `OPEN_ABUNDANCE_MASTER_PLAN.md`, `MASTER_KANBAN.md`.
