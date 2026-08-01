# Mutual Credit & Internal Market Plan

Статус: канонический план mutual credit discovery, 2026-08-01. Алгоритм не реализован и не включается до безопасного settlement/review слоя Marketplace.

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
- partial Phase 3/4: deal/events, create/accept/cancel routes и atomic Wallet + artifact completion в migration `20260724230000_marketplace_deals_phase3_4.sql`.

Критические gaps текущего Marketplace:

- buyer Wallet не резервируется при accept;
- automatic expire/refund, dispute и idempotent retry не завершены;
- `deal_completed` Trust event, reviews и User QA отсутствуют;
- `marketplace_user_balances` и mutual ranking не реализованы.

Поэтому mutual credit пока является только принятым алгоритмическим направлением.

## 6. Порядок реализации

1. Закрыть funds reserve, expire/refund, dispute и User QA Marketplace.
2. Добавить buyer reviews и quality confidence, не доверяя сырой средней оценке.
3. Материализовать `spent`, `earned`, eligible amount и unique counterparties по rolling windows.
4. Считать boost в shadow mode и сравнить с выдачей без него.
5. Провести A/B или ограниченный pilot с cap и kill switch.
6. Включить только если растут legitimate completions/GMV без роста returns, disputes и concentration.

## 7. Decision gates и метрики

До реализации определить rolling window, cap, smoothing/decay, минимальное число контрагентов, комиссию системы и dispute SLA. Значения хранятся как versioned configuration.

Главные метрики: legitimate settled GMV, completion rate, unique buyers/sellers, repeat purchases, return/dispute/wash rate, seller exposure concentration, incremental conversions и фактически полученная комиссия. `spent - earned → 0` является направлением балансировки возможностей, а не обязательным индивидуальным долгом пользователя.

Связанные документы: `MARKETPLACE_ESCROW_PLAN.md`, `TRUST_RECIPROCITY_MARKET_PLAN.md`, `OPEN_ABUNDANCE_MASTER_PLAN.md`, `MASTER_KANBAN.md`.