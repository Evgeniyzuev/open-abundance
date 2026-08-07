# Trust, Reciprocity And Market Plan

Этот документ задает порядок внедрения Trust-lite, взаимных подтверждений, баланса взаимности, предметов и будущей торговли. Он дополняет `OPEN_ABUNDANCE_MASTER_PLAN.md`, `REFERRALS_TEAMS_PLAN.md`, `FEED_POSTING_RECOMMENDATIONS_PLAN.md`, `MARKETPLACE_ESCROW_PLAN.md` и `CHALLENGES_CATALOG.md`, не заменяя их.

## Решение

Следующий крупный слой лучше строить не с автоматических контрактов и не с публичного рейтинга, а с подтвержденных действий.

Рекомендуемая последовательность:

1. Trust-lite: ledger подтвержденных действий и взаимные подтверждения.
2. Reciprocity balance: мягкий баланс "получаю / помогаю / завершаю".
3. Inventory artifacts: предметы как доказательства пути, без рыночной экономики.
4. Trade-lite и deal lifecycle.
5. Escrow/reviews/dispute и anti-abuse.
6. Trust v2: shadow calculation → private summary → calibrated public score.

## Принципы

- Trust не является абстрактной репутацией личности. Trust начинается как набор подтвержденных событий.
- В Trust-lite mutual confirmation не является публичной оценкой «хороший/плохой человек». В Trust v2 принято публичное число над проверяемыми взаимодействиями, но не моральный рейтинг личности; оно появляется только после shadow/private фаз.
- Предметы сначала являются артефактами прогресса, а не торгуемыми NFT/asset.
- Технический deal lifecycle может развиваться до полного Skill Passport, но публичный Trust v2 и квалифицированный рынок требуют evidence, reviews, dispute flow и Wallet ledger.
- Автоматические контракты откладываются до появления надежного ledger, статусов сделки, ручного review и механики споров.

## Scope MVP

В MVP Trust-lite отвечает на вопрос: "Какие действия этого пользователя подтверждены системой или другим участником?"

Входит:

- подтверждение помощи другому участнику;
- подтверждение полученной помощи;
- подтверждение завершенной простой сделки;
- подтверждение выполненного community-check челленджа;
- скрытый или полупубличный reciprocity score для рекомендаций и продвижения.

Не входит:

- публичная числовая репутация;
- штрафы, баны и сложная модерация Trust;
- автоматические контракты;
- арбитраж денежных споров;
- продажа предметов.

## Trust v2 — принятое направление

Trust v2 не заменяет `trust_events`; он рассчитывает объяснимый summary поверх append-only событий, сделок, оценок, corrections и annual decay.

Принятые правила:

- при регистрации создаётся небольшой положительный starter event; точное значение ещё не утверждено;
- после допустимого взаимодействия контрагент оценивает другого по шкале `0.0–5.0` с шагом `0.1`; `3.0` нейтрально;
- завершённая settled deal использует фактическую сумму после возвратов, нелинейно через квадратный корень;
- максимальное положительное и отрицательное влияние одного rater на одного target линейно зависит от Core Level rater и ограничивается rolling pair budget;
- после всех caps rater получает `10%` от того же подписанного изменения: положительная оценка немного повышает обоих, негативная имеет небольшую цену для автора;
- в конце каждого календарного года текущий summary умножается на `0.9`; исходные ledger events не меняются;
- score не меняет Core, Wallet, Core Level или Skill Level.

Кандидат формулы:

```text
amount_factor(a) = c + sqrt(clamp(a / A, 0, amount_cap))
raw_delta = beta × (rating - 3.0) × amount_factor(a)
pair_cap(level) = cap_base + cap_per_level × level
target_delta = clamp_to_remaining_pair_budget(raw_delta, pair_cap(level))
rater_delta = 0.10 × target_delta
```

`A`, `c`, `beta`, caps, rolling window, starter value и публичная шкала являются versioned configuration и decision gate. Одна крупная сделка не может определить весь Trust.

Для незавершённого, отменённого или нулевого заказа допускается отдельный малый fixed-impact rating event только после доказанного двустороннего взаимодействия: обе стороны приняли условия, либо контрагент подтвердил контакт/работу. Одного созданного запроса недостаточно. Amount multiplier для такого события равен нулю; применяется отдельная малая константа и более строгий pair cap.

Публичность вводится поэтапно:

1. shadow calculation и анализ synthetic/real сценариев;
2. private summary владельцу с основаниями, corrections и disputes;
3. qualitative badges контрагентам;
4. ограниченный public numeric pilot после anti-abuse review;
5. более широкое использование только по данным пилота.

## Current Status

2026-06-11:

- Phase 1 database foundation started in `supabase/migrations/20260611161340_trust_reciprocity_foundation.sql`.
- Added `trust_events`, `mutual_confirmations`, `reciprocity_balances`.
- Added RLS, minimal Data API grants, indexes and `updated_at` triggers.
- Phase 2 API foundation added in `lib/trust.ts` and `/api/trust/*`.
- Added no-store routes for creating/listing confirmation requests, confirming, declining and loading the current user's Trust summary.
- Confirm/decline routes manually enforce that only `counterparty_user_id` can respond, create a confirmed `trust_events` row on confirm, and recalculate `reciprocity_balances`.
- Client can still create only pending confirmation requests and read related rows directly; privileged state changes stay server-side through service-role routes.
- Phase 2 UX foundation added in `components/SocialApp.tsx`: profile loads incoming/outgoing confirmation requests, lets a counterparty confirm/decline pending requests, and can request a contact confirmation from the Contacts block.
- Confirmation UI remains private to the current profile screen; no public numeric reputation is exposed.

2026-06-12:

- Applied Trust migrations to the linked Supabase project and regenerated `lib/database.types.ts`.
- Added and applied `20260612031017_trust_challenge_integration.sql` with `Help Someone Move` and `Trust Proof`.
- Added and applied `20260612031254_trust_fk_indexes.sql` for Trust foreign-key performance indexes.
- `/api/challenges/check` now supports `trust_event_confirmed:*` verification logic.
- Marketplace item sales moved into a dedicated escrow plan: `docs/MARKETPLACE_ESCROW_PLAN.md`.
- Added and applied marketplace Phase 1 DB foundation: `user_artifacts` and `wallet_ledger` migrations, RLS and generated types.
- Added and applied `wallet_core_topup` RPC and `First Wallet To Core` challenge integration; Wallet -> Core now writes `wallet_ledger`.
- Added and applied `wallet_transfer` RPC, `/api/wallet/transfer` and `First Wallet Transfer` challenge integration; Wallet-to-Wallet now writes paired debit/credit `wallet_ledger` rows.
- Added Wallet transfer modal with contact selection/manual recipient id fallback and server refresh after successful transfer.
- Added and applied Marketplace listings Phase 2: `marketplace_listings`, create/list/cancel API and Wallet -> Market listing grid.
- Updated Marketplace listings UI/API so users can create product/service/skill cards directly; open cards are limited by current Core level.
- Marketplace quality layer is specified in `docs/MARKETPLACE_ESCROW_PLAN.md`: listing sales/review counters and buyer reviews are part of the internal MVP; private `participation_balance = marketplace_purchases_gross - marketplace_sales_gross` belongs to the deferred `user_economy_metrics` stage after buyer/seller QA.

2026-08-01:

- Trust v2 accepted as a future public numeric summary, without changing the current Trust-lite implementation.
- Marketplace deal lifecycle, funds reserve, expire/refund, disputes and reviews exist in the local DB-only implementation; remote apply and buyer/seller User QA remain prerequisites for Trust v2 and any mutual ranking.
- Exact Trust scale and constants remain decision gates; no Trust v2 tables or scoring worker are implemented.

## Core Entities

### `trust_events`

Неизменяемый журнал подтвержденных событий.

Минимальные поля:

- `id`
- `actor_user_id` - кто совершил действие;
- `target_user_id` - кому помогли / с кем была сделка;
- `event_type` - `help_given`, `help_received`, `deal_completed`, `challenge_confirmed`, `proof_added`;
- `source_type` - `challenge`, `wish`, `feed_post`, `marketplace_deal`, `team_contact`, `manual`;
- `source_id`
- `status` - `pending`, `confirmed`, `rejected`, `revoked`;
- `created_by_user_id`
- `confirmed_by_user_id`
- `created_at`, `confirmed_at`
- `metadata jsonb`

Правило: событие не должно повышать Trust, пока оно не `confirmed`.

### `mutual_confirmations`

Запросы на подтверждение между пользователями.

Минимальные поля:

- `id`
- `requester_user_id`
- `counterparty_user_id`
- `confirmation_type`
- `source_type`, `source_id`
- `message`
- `status` - `pending`, `confirmed`, `declined`, `expired`;
- `expires_at`
- `created_at`, `updated_at`

Использование:

- "Подтверди, что я помог";
- "Подтверди завершение сделки";
- "Подтверди community-check челлендж";
- "Подтверди контакт/командное взаимодействие".

### `reciprocity_balances`

Денормализованная таблица для быстрых рекомендаций и сортировки.

Минимальные поля:

- `user_id`
- `help_given_count`
- `help_received_count`
- `deals_completed_count`
- `confirmations_given_count`
- `confirmations_received_count`
- `recent_positive_events`
- `reciprocity_score`
- `updated_at`

Формула MVP:

```text
reciprocity_score =
  help_given_count * 2
  + confirmations_given_count
  + deals_completed_count * 2
  + recent_positive_events
  - unresolved_pending_penalty
```

Это не публичный рейтинг. Это системный сигнал для:

- рекомендаций AI;
- приоритета в списках помощи;
- будущей видимости marketplace-предложений;
- подбора лидов/команд;
- открытия некоторых Trust-челленджей.

### `user_artifacts`

Инвентарь предметов прогресса.

Минимальные поля:

- `id`
- `user_id`
- `artifact_type`
- `title`
- `description`
- `source_type`, `source_id`
- `rarity` - `common`, `rare`, `epic`, `system`;
- `visibility` - `private`, `public`, `team`;
- `created_at`
- `metadata jsonb`

Первый набор предметов:

- Abundance book-brochure;
- Compound Interest Certificate;
- Personal Value Map;
- First Growth Story;
- Helper Badge;
- First Confirmed Help;
- First Completed Deal;
- Team Welcome Mark.

## Product Flow

### Mutual Confirmation

1. Пользователь выполняет действие: помог, завершил сделку, поддержал цель.
2. Приложение предлагает отправить запрос подтверждения.
3. Второй пользователь видит запрос в Social/Profile/Notifications.
4. После подтверждения создается `trust_events` со статусом `confirmed`.
5. Обновляется `reciprocity_balances`.
6. Если событие привязано к челленджу, `/api/challenges/check` может засчитать community proof.

### Reciprocity Promotion

Marketplace-specific mutual balance is separate from public Trust reputation: `spent - earned` can softly boost listing visibility with caps, but it should not be shown as a public numeric score.

Reciprocity влияет на продвижение только мягко:

- выше в списке "люди, которые могут помочь";
- выше в будущих marketplace-рекомендациях;
- AI чаще предлагает связаться с активным участником;
- команда может видеть "активно помогает" без числового рейтинга.

Не делать в MVP:

- публичную шкалу 1-5;
- дизлайки пользователя;
- понижение уровня;
- финансовые штрафы;
- автоскрытие профиля по низкому score.

### Inventory Artifacts

Предмет выдается после подтвержденного события или важного образовательного шага.

Примеры:

- прошел тест сложного процента -> `Compound Interest Certificate`;
- опубликовал первую историю прогресса -> `First Growth Story`;
- получил подтверждение помощи -> `First Confirmed Help`;
- завершил сделку -> `First Completed Deal`.

Предметы показываются в `Goals -> Results` и позже в публичном профиле.

## Challenge Integration

Trust-lite нужен для этих челленджей:

| Challenge | Verification | Notes |
| --- | --- | --- |
| Help Someone Move | `trust_event_confirmed:help_given` | Нужен counterparty confirmation |
| Trust Proof | `trust_event_confirmed:proof_added` | Контакт, портфолио, рекомендация или результат |
| Complete Marketplace Deal | `trust_event_confirmed:deal_completed` | После trade-lite |
| Earn from Your Skill | `trust_event_confirmed:deal_completed` + Wallet ledger | После Wallet-to-Wallet |
| Fund Someone's Goal | `trust_event_confirmed:help_given` + goal funding ledger | После goal funding flow |

## API Plan

MVP endpoints:

- `POST /api/trust/confirmations`
  Создать запрос подтверждения.
- `GET /api/trust/confirmations`
  Получить входящие/исходящие запросы.
- `POST /api/trust/confirmations/[id]/confirm`
  Подтвердить запрос.
- `POST /api/trust/confirmations/[id]/decline`
  Отклонить запрос.
- `GET /api/trust/summary`
  Получить Trust-lite и reciprocity summary текущего пользователя.
- `GET /api/users/[id]/trust-summary`
  Получить публично разрешенную часть Trust-summary.

## UI Plan

### Social/Profile

- блок "Подтвержденные действия";
- блок "Взаимность" без числовой публичной оценки;
- входящие запросы подтверждения;
- кнопка "Запросить подтверждение" на релевантных событиях.

### Goals -> Results

- инвентарь артефактов;
- сертификаты тестов;
- подтвержденные milestones;
- ссылка на Trust-summary.

### Challenges

- для community-check челленджей показывать статус:
  - `Need confirmation`;
  - `Request sent`;
  - `Confirmed`;
  - `Declined`;
  - `Expired`.

## Anti-Abuse

Минимальные правила:

- нельзя подтверждать самого себя;
- один counterparty не должен бесконечно фармить один и тот же тип события;
- rate limit на запросы подтверждения;
- pending-запросы истекают;
- rejected/declined события не дают Trust;
- high-value события требуют ledger source;
- сделки и funding требуют non-self Wallet ledger;
- повторное подтверждение одного `source_type/source_id` не создает новый Trust event.

## Implementation Phases

### Phase 1. Trust-lite Data Foundation

- migration для `trust_events`, `mutual_confirmations`, `reciprocity_balances`;
- RLS policies;
- server helpers для создания pending confirmation и confirmed trust event;
- no-store API routes;
- advisor/security check после DDL.

### Phase 2. Confirmation UX

- входящие/исходящие подтверждения в Social/Profile;
- confirm/decline;
- basic notifications panel или существующий notification block;
- статус запроса в челлендже.

### Phase 3. Challenge Proof Integration

- `verifyChallenge()` поддерживает `trust_event_confirmed:*`;
- добавить Help Someone Move и Trust Proof только после UX подтверждений;
- не добавлять Wallet/reputation rewards.

### Phase 4. Reciprocity Summary

- пересчет `reciprocity_balances`;
- скрытый score для AI/recommendations;
- публичные бейджи только качественные: "Помогает участникам", "Подтвержденные сделки".

### Phase 5. Inventory Artifacts

- `user_artifacts`;
- выдача предметов за milestones;
- отображение в `Goals -> Results`;
- настройки видимости предмета.

### Phase 6. Trade-lite

- `marketplace_listings` MVP;
- request/accept simple service;
- completion confirmation by both sides;
- item sales with Wallet escrow are planned separately in `docs/MARKETPLACE_ESCROW_PLAN.md`;
- no legal/financial auto-contracts, external payments or public numeric reputation.

### Phase 7. Automatic Contracts Later

Запускать только после:

- Wallet-to-Wallet ledger;
- trade-lite;
- trust confirmations;
- dispute/manual review;
- anti-abuse thresholds;
- clear legal/product language.

### Phase 8. Trust v2

- reviews и dispute/correction ledger поверх допустимых interaction events;
- versioned score configuration и deterministic recalculation;
- synthetic scenarios, shadow calculation и abuse monitoring;
- private owner summary с объяснением каждой дельты;
- ограниченный public pilot только после утверждения scale/start/constants/caps;
- никакого автоматического уменьшения Core, Wallet, Skill Level или базового доступа.

## Acceptance Criteria For Trust-lite MVP

- Пользователь может запросить подтверждение действия у другого пользователя.
- Второй пользователь может подтвердить или отклонить запрос.
- Подтвержденное событие создает `trust_events`.
- Self-confirmation невозможен.
- Community-check челлендж может проверять confirmed trust event.
- Reciprocity summary считается без публичного числового рейтинга.
- Предметы могут выдаваться за подтвержденные milestones.
- Marketplace economic launch и Trust v2 остаются закрытыми, пока нет funds reserve, dispute/review, anti-abuse и User QA.

## Open Questions

Trust-lite:

- какие help/proof confirmations показывать публично;
- срок жизни pending confirmation и лимит одного counterparty;
- где показывать входящие запросы и когда включать ручной review.

Trust v2 decision gates:

- публичная шкала summary (`0–5`, `0–100` или level + score);
- starter Trust и абсолютные границы score;
- `A`, `c`, `beta`, per-deal caps, rolling pair window и fixed constant для нулевой суммы;
- минимальное доказательство двустороннего взаимодействия для cancelled/incomplete rating;
- окно rating/edit, обязательные причины и evidence для экстремальных оценок;
- correction/dispute SLA и критерии выхода из shadow/private в public pilot.
