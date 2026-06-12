# Trust, Reciprocity And Market Plan

Этот документ задает порядок внедрения Trust-lite, взаимных подтверждений, баланса взаимности, предметов и будущей торговли. Он дополняет `OPEN_ABUNDANCE_MASTER_PLAN.md`, `REFERRALS_TEAMS_PLAN.md`, `FEED_POSTING_RECOMMENDATIONS_PLAN.md`, `MARKETPLACE_ESCROW_PLAN.md` и `CHALLENGES_CATALOG.md`, не заменяя их.

## Решение

Следующий крупный слой лучше строить не с автоматических контрактов и не с публичного рейтинга, а с подтвержденных действий.

Рекомендуемая последовательность:

1. Trust-lite: ledger подтвержденных действий и взаимные подтверждения.
2. Reciprocity balance: мягкий баланс "получаю / помогаю / завершаю".
3. Inventory artifacts: предметы как доказательства пути, без рыночной экономики.
4. Trade-lite: простые предложения услуг и ручное подтверждение результата.
5. Automatic contracts: только после Wallet-to-Wallet ledger, dispute flow и anti-abuse.

## Принципы

- Trust не является абстрактной репутацией личности. Trust начинается как набор подтвержденных событий.
- Mutual rating не должен быть публичной оценкой "хороший/плохой человек". Для MVP это reciprocity signal: насколько пользователь участвует во взаимном росте.
- Предметы сначала являются артефактами прогресса, а не торгуемыми NFT/asset.
- Торговля запускается после публичных профилей, Skill Passport, Wallet-to-Wallet и подтверждений участников.
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

- `marketplace_offers` MVP;
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

## Acceptance Criteria For MVP

- Пользователь может запросить подтверждение действия у другого пользователя.
- Второй пользователь может подтвердить или отклонить запрос.
- Подтвержденное событие создает `trust_events`.
- Self-confirmation невозможен.
- Community-check челлендж может проверять confirmed trust event.
- Reciprocity summary считается без публичного числового рейтинга.
- Предметы могут выдаваться за подтвержденные milestones.
- Marketplace и automatic contracts остаются закрытыми, пока нет ledger и dispute flow.

## Open Questions

- Какие типы подтверждений показывать публично, а какие только владельцу?
- Нужен ли counter-confirmation для каждого help event или достаточно одного подтверждения получателя?
- Какой срок жизни pending confirmation: 3, 7 или 14 дней?
- Где лучше показывать входящие подтверждения в MVP: Social/Profile или отдельный Notifications экран?
- Сколько подтверждений от одного counterparty учитывать в reciprocity за 30 дней?
- Когда вводить ручной review для спорных событий?
