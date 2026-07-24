# Mutual Credit & Internal Market Plan

Этот документ фиксирует механику взаимных сделок (mutual credit), продвижения продукта пользователя в зависимости от его трат и повышения внутреннего оборота за счет внутренних продаж.

## 1. Концепция

**Основная идея:** чем больше пользователь тратит внутри системы, тем выше продвигаются его собственные товары и услуги. Это создает замкнутый цикл:

```
покупаю у других → мой mutual market balance растет → мои товары видят чаще → я больше продаю → я больше трачу
```

## 2. Механика Mutual Credit

### Баланс взаимности на рынке

```text
mutual_market_balance = total_spent - total_earned
```

Где:
- `total_spent` — сумма всех завершенных покупок пользователя на marketplace
- `total_earned` — сумма всех завершенных продаж пользователя на marketplace

### Влияние на ранжирование

`mutual_market_balance` используется как мягкий повышающий сигнал в выдаче объявлений:

```text
listing_score =
  freshness
  + smoothed_rating_boost
  + log(1 + sales_count) * sales_weight
  + capped_mutual_balance_boost
  - risk_or_report_penalty
```

Правила:
- Положительный balance (потратил > заработал) = мягкий boost в выдаче
- Отрицательный balance (заработал > потратил) = нейтрально, без штрафа
- Boost имеет кап (например, не более +20% к базовому score)
- `mutual_market_balance` не показывается как публичный рейтинг
- Это системный сигнал, а не социальная оценка

### Зачем это нужно

1. **Стимулирует внутренние продажи:** пользователи покупают друг у друга, а не уходят на внешние площадки
2. **Повышает внутренний оборот (GMV):** чем больше транзакций внутри системы, тем выше liquidity и полезность Wallet
3. **Создает "экономику внимания":** активные покупатели получают больше просмотров своих товаров
4. **Снижает отток:** пользователь, который и продает, и покупает, сильнее привязан к системе

## 3. Продуктовый цикл

### Для продавца
1. Создает карточку товара/услуги/навыка
2. Выставляет цену в Wallet
3. Получает оплату после завершения сделки
4. Тратит полученное на покупки у других → повышает свой mutual balance → его товары видят чаще

### Для покупателя
1. Находит товар/услугу в marketplace
2. Покупает за Wallet
3. Получает товар, оставляет отзыв
4. Его mutual balance растет → его собственные товары продвигаются

### Для системы
1. Каждая сделка = +1 к внутреннему обороту
2. Комиссия системы (менее 1%) пополняет Treasury
3. Рост оборота = рост ликвидности = больше возможностей для всех

## 4. Статус реализации

### Реализовано:
- **Phase 1 (Ownership & Ledger):** `user_artifacts`, `wallet_ledger`, `wallet_core_topup` RPC, `wallet_transfer` RPC, Wallet-to-Wallet UI
- **Phase 2 (Listings):** `marketplace_listings`, create/list/cancel API, UI listing grid, создание карточек товаров/услуг, лимит = уровень Core
- **Trust-lite Phase 1-2:** `trust_events`, `mutual_confirmations`, `reciprocity_balances`, API confirm/decline, UX в SocialApp

### Не реализовано:
- **Phase 3 (Deals & Escrow):** `marketplace_deals`, `marketplace_deal_events`, создание сделки покупателем, Wallet reserve/escrow, accept flow продавца
- **Phase 4 (Atomic Completion):** серверная транзакция завершения, transfer Wallet + item ownership, refund/cancel/expire
- **Phase 5 (Trust & Challenges):** `trust_events deal_completed`, челленджи для сделок
- **Phase 6 (Reviews & Discovery):** `marketplace_reviews`, рейтинг/отзывы, `marketplace_user_balances`, ranking с mutual credit boost

## 5. Что требуется прояснить/решить

1. Точный размер комиссии системы (менее 1%, но какая именно?)
2. Кап для mutual balance boost (максимальный процент повышения в выдаче)
3. Минимальный порог сделок перед включением mutual credit в ранжирование
4. Нужен ли dispute flow в MVP или достаточно "обратиться в поддержку"?
5. Как учитывать сделки, если одна сторона не выполнила обязательства?

## 6. Следующие шаги

1. [ ] Реализовать Phase 3: `marketplace_deals`, `marketplace_deal_events`, создание сделки, Wallet reserve/escrow
2. [ ] Реализовать Phase 4: атомарное завершение сделки (transfer Wallet + item ownership), refund/cancel/expire
3. [ ] Реализовать Phase 5: `trust_events deal_completed`, челленджи для сделок
4. [ ] Реализовать Phase 6: `marketplace_reviews`, рейтинг/отзывы, `marketplace_user_balances`, ranking
5. [ ] Включить mutual credit boost в алгоритм ранжирования
6. [ ] Добавить UI "Мои покупки / Мои продажи" с историей и mutual balance