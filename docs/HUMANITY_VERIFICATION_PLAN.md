# Подтверждение человечности и уникальности

## Текущий статус

Дата фиксации: 2026-08-30. Это decision-complete план интеграции, реализация ещё не начата.

Принятое направление:

- уровень 1 — обычный аккаунт без доказательства человечности; Turnstile используется только как пооперационная anti-bot защита;
- уровень 2 — пилот внешнего liveness-провайдера Sumsub: лицо в кадре, случайные четыре цифры произносятся вслух, затем проверяется duplicate search в пределах нашего provider tenant;
- уровень 3 — опциональный World ID Orb через World App как более сильное privacy-preserving proof-of-humanity;
- имя, паспорт и KYC не являются целью этой функции;
- Open Abundance не хранит raw-видео, аудио, фотографии лица или биометрические embedding-и.

До production-подключения Sumsub должны быть подтверждены договором и тестовым аккаунтом: face-only сценарий без документа, Face Duplicate Search в одном tenant, доступность по нужным регионам, retention/deletion, PAD, webhook-подпись и порядок manual review. Если это не подтверждается, уровень 2 не считается готовым, а не заменяется самописным “распознаванием”.

## 1. Что именно обещают уровни

| Уровень | Название в продукте | Что проверяется | Где действует | Что не обещается |
|---|---|---|---|---|
| 1 | Аккаунт без подтверждения | Сессия, rate limit и при необходимости Turnstile challenge | На конкретной операции | Не доказывает, что пользователь человек или уникален |
| 2 | Подтверждённый человек | Provider liveness и проверка, что лицо не дублирует уже подтверждённый профиль | В нашем аккаунте провайдера (tenant) | Не даёт глобальной уникальности, имени или KYC |
| 3 | Сильное proof-of-humanity | World ID Orb, backend-верификация и уникальный nullifier для заданного app/action | В контексте World ID app/RP и action | Не раскрывает личность; `session_id` не является доказательством уникальности |

В интерфейсе не использовать слово «бот» для уровня 1. Нейтральные состояния: «не подтверждено», «проверка на рассмотрении», «подтверждено». Ни один уровень не должен формулироваться как абсолютная гарантия: liveness и 1:N matching вероятностны, возможны false positive/false negative, deepfake и ручной review.

`humanity_confirmed_accounts` считается только по действительному успешному уровню 2 или 3. Регистрация, Google-вход, телефон, активность, IP, cookie и device fingerprint сами по себе эту метрику не увеличивают. При необходимости отдельно считать `humanity_unique_accounts` по принятому бизнес-правилу.

## 2. Уровень 1: доступ без подтверждения

Базовый аккаунт остаётся доступным. Проверка нужна только там, где появляется автоматизированный abuse:

- Cloudflare Turnstile Free — бесплатная challenge-защита для web-операций; токен одноразовый и живёт ограниченное время, поэтому это не постоянный human credential;
- проверять Turnstile на регистрации, подозрительных повторах и rate-limited endpoint-ах через серверную валидацию;
- не выдавать после Turnstile `humanity_level = 2` и не открывать permanent uniqueness-gated rewards;
- не блокировать базовую навигацию и вывод собственных средств только из-за отсутствия PoH.

Переменные окружения: `TURNSTILE_SITE_KEY` (только public), `TURNSTILE_SECRET_KEY` (только server). Секреты не помещать в `NEXT_PUBLIC_*`, JWT metadata или клиентский bundle.

## 3. Уровень 2: remote liveness и tenant uniqueness

### Рекомендуемый пилот — Sumsub

Целевой пользовательский сценарий — 3–4 коротких экрана в Today/onboarding:

1. объяснение цели, согласие на обработку и ручная доступная альтернатива;
2. провайдер открывает камеру, пользователь центрирует лицо, нажимает запись и читает четыре случайные цифры;
3. провайдер показывает processing/result, приложение получает только безопасный статус;
4. экран результата: подтверждено, повторить позже или отправить на review.

На стороне Sumsub запрашиваются Short Video Fragment/Advanced Liveness и Face Duplicate Search. Duplicate search должен работать по одному client key/tenant и возвращать opaque applicant/check ID, а не фотографию в Open Abundance. Один человек в другом сервисе или другом tenant этим уровнем не обнаруживается.

Коммерческая проверка перед реализацией обязательна. На момент подготовки плана у Sumsub есть платный Basic и trial, но цена и доступность face-only duplicate search зависят от договора; это не следует считать бесплатным production-решением. Альтернативы для отдельного RFP: FaceTec (3D liveness + optional 1:N Face Search) и Veriff (liveness и duplicate/farming signals). Они не становятся вторым production-провайдером без отдельного сравнительного пилота.

### Почему не делать уровень 2 полностью в браузере

Без провайдера можно собрать полезный interaction check:

- `getUserMedia` + server nonce + срок жизни challenge;
- случайные действия головой и цифры;
- MediaPipe Face Landmarker для локальной подсказки кадрирования;
- `MediaRecorder` для передачи короткого фрагмента только в выбранный backend;
- Web Speech API — лишь как необязательная подсказка, а не как источник доверия, потому что поддержка и распознавание различаются по браузерам.

Такой режим не доказывает физическую камеру, защищённость от virtual camera/replay/deepfake или уникальность лица. Его можно использовать для UX и снижения простейшей автоматизации, но нельзя называть уровнем 2, выдавать за biometric identity или использовать как единственную проверку системной награды.

### Можно ли узнать человека по hash

Нет, обычный SHA/HMAC от фотографии, видео или голоса не решает задачу повторного человека: новая съёмка даёт другие байты, а hash специально разрушает возможность измерить сходство. Для 1:N deduplication нужны embedding и approximate similarity search с template protection, unlinkability и revocation. Самостоятельно строить такую биометрическую галерею в Supabase нельзя.

В Open Abundance сохраняются только provider result, opaque provider subject/check ID, версия сценария и время. Если провайдер не даёт безопасный duplicate signal без выдачи raw-биометрии, он не подходит для этого уровня.

## 4. Уровень 3: World ID Orb

Уровень 3 — добровольный upgrade для функций с максимальным риском Sybil, а не обязательная регистрация:

- пользователь проходит Orb-проверку через World App; это не browser-only flow;
- frontend получает proof/IDKit result, но окончательная проверка выполняется на backend World ID;
- backend создаёт и подписывает RP context, проверяет app ID, action, signal и подпись;
- для уникальности хранится canonical `nullifier` в контексте нашего app/action; `session_id` используется только для continuity и не считается уникальным ключом;
- повторный nullifier для того же правила — idempotent rejection или уже подтверждённый результат, без второй награды;
- уровень 3 не понижать автоматически из-за временной недоступности World; отзыв или спор проходит отдельный review.

Переменные окружения: `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION`. Signing key и service-role key никогда не доступны браузеру.

World ID Selfie Check и похожие mobile-only варианты не считать заменой Orb для уровня 3: они удобнее, но дают другой assurance и не должны скрыто называться тем же уровнем.

## 5. Единый контракт состояния

Не смешивать «человек», «liveness» и «уникальность» в одном boolean. Минимальный read model:

```text
humanity_accounts
  user_id (PK/FK auth.users)
  humanity_level (0..3)
  verification_status (unverified | pending | verified | review_required | rejected | expired)
  liveness_assurance (none | remote_provider | orb)
  uniqueness_assurance (none | tenant | portable)
  anti_bot_signal (none | turnstile)
  method (turnstile | sumsub | facetec | veriff | world_orb | manual)
  provider_subject_id (opaque, nullable)
  verified_at, expires_at, reviewed_at, created_at, updated_at (timestamptz)

humanity_verification_attempts
  id (bigint generated identity PK)
  user_id (FK), provider, method, provider_check_id
  status, result_code, review_state
  consent_version, scenario_version, created_at, updated_at

humanity_provider_events
  id (bigint generated identity PK)
  provider, provider_event_id (UNIQUE), attempt_id (FK)
  received_at, processed_at, processing_status
```

Правила схемы:

- для статусов и assurance использовать `text` + `CHECK`, а не неуправляемые enum; даты — `timestamptz`;
- внутренние event/attempt ID — `bigint generated ... as identity`; FK `user_id` и `attempt_id` индексировать;
- уникальность webhook — `(provider, provider_event_id)`; provider check ID также идемпотентен;
- не хранить raw webhook payload, видео, аудио, face image, embedding, паспортные поля или голосовые записи;
- включить RLS на каждой таблице. Таблицы не получают клиентских `anon`/`authenticated` policies: запись и чтение выполняются server-role через `lib/serverSupabase.ts`;
- после миграции проверить Data API exposure: с 2026 года новые public tables могут не выставляться автоматически. Публичный доступ не включать только ради удобства;
- не использовать `user_metadata`/редактируемые JWT claims для authorization.

### Защита reward в базе

К таблице challenge добавить, если нужна gate-логика:

```text
required_humanity_level smallint default 0
requires_unique_human boolean default false
```

`complete_user_challenge` и будущие reward RPC должны проверять эти поля и текущий `humanity_accounts` в одной транзакции. UI и route guard — только подсказка; клиент не может сам выставить уровень или обойти gate. Уже существующую стартовую награду регистрации ретроактивно не менять; новые системные rewards, referral payouts и другие abuse-sensitive операции подключать к gate после пилота.

## 6. API и обработка событий

Планируемый server-only API:

- `GET /api/humanity/status` — no-store сводка текущего уровня и доступных upgrade;
- `POST /api/humanity/remote/session` — создать provider session после проверки auth, rate limit и nonce;
- `POST /api/humanity/remote/webhook` — принять подписанный webhook, проверить raw body, записать idempotent event и повторно запросить authoritative result у провайдера;
- `POST /api/humanity/world/rp-context` — выдать context/action только после серверной проверки сессии;
- `POST /api/humanity/world/verify` — проверить proof, action, signal, nullifier и идемпотентно повысить assurance;
- `POST /api/humanity/review` — manual appeal/recovery без раскрытия биометрии оператору приложения.

Webhook-обработчик обязан принимать out-of-order callbacks, повторные события и конкурентные запросы. `verified` не откатывается в `unverified` из-за provider outage; подозрение переводится в `review_required`, а не в безвозвратный auto-ban. Провайдерские IDs и reason codes не показывать публично без необходимости.

## 7. UX, доступность и восстановление

- onboarding объясняет зачем нужна проверка, но не заставляет проходить её до базового использования;
- Today показывает один понятный CTA и прогресс, без обещания «докажем, что вы настоящий человек»;
- не требовать полный оборот головы на 360°; достаточно сценария провайдера с короткими действиями;
- предусмотреть отсутствие камеры, отказ в разрешении, iOS Safari/Android Chrome/PWA, слабый интернет и отсутствие голосового ввода;
- manual alternative должна иметь rate limit и review SLA, но не просить хранить документы в обычной базе без отдельного KYC-проекта;
- публичный badge показывать только по opt-in и без provider ID; уровень 1 не маркировать как «бот»;
- при смене устройства разрешать повторную проверку через авторизованный аккаунт, но не создавать второй reward;
- удалить пользователя — инициировать deletion у провайдера и зафиксировать только технический результат удаления.

## 8. Порядок реализации

1. **Vendor/legal gate (3–5 дней):** Sumsub sandbox, face-only без документа, duplicate search, регионы, retention, PAD, DPA/DPIA, webhook и цена; параллельно подтвердить World ID Orb availability и action model.
2. **Level 1 (2–4 дня):** Turnstile server validation, rate limits, telemetry без биометрии и отдельный статус «не подтверждено».
3. **Level 2 sandbox (5–8 дней):** session API, hosted/Web SDK, webhook idempotency, минимальная схема, Today UX и provider deletion/recovery.
4. **Level 2 abuse pilot (3–5 дней):** две учётные записи одного человека, два разных человека, replay/deepfake/injection, duplicate review, manual alternative и Safari/Android/PWA.
5. **Level 3 (4–7 дней):** World ID IDKit, RP context, backend verify, nullifier uniqueness, wrong action/app/signal tests и optional upgrade UX.
6. **Hardening (около недели):** reward RPC gates, RLS/Data API review, observability, privacy review, incident runbook и ограниченный rollout.

## 9. Acceptance и launch gates

Запуск запрещён, пока не выполнены все пункты:

- remote migration применена, migration history проверена, REST schema check возвращает 200 и проведён QA с двумя аккаунтами;
- обычный клиент не может читать/писать verification tables или подменять level через metadata;
- один человек в Account A и попытка Account B дают duplicate/review, а похожие, но разные лица не auto-ban-ятся;
- webhook signature, replay, duplicate, out-of-order и concurrent callbacks покрыты тестами;
- World proof отклоняется при неправильном app/action/signal и повторном nullifier;
- reward нельзя получить без требуемого level/uniqueness даже при прямом вызове RPC;
- в Supabase, analytics, logs и error reports отсутствуют raw media и biometric templates;
- проверены camera permissions, iOS Safari, Android Chrome, PWA, отказ от голоса, manual recovery и удаление данных;
- есть понятный provider outage режим, review SLA, appeal и операторский audit trail;
- согласованы юридические основания обработки биометрии, сроки хранения у провайдера и региональные ограничения.

## 10. Метрики и правила интерпретации

Собирать только агрегаты: `started`, `completed`, `failed`, `review_required`, `rejected`, latency, provider error rate, repeat rate и конверсию level 2/3. Не логировать кадры, аудио, цифры challenge, face score или embedding.

Отдельно показывать:

- `humanity_confirmed_accounts` — успешные действующие уровни 2+;
- `humanity_unique_accounts` — только если определено, какой provider/action scope считается уникальным;
- `humanity_review_required` и provider failure rate — это качество и операционная нагрузка, а не подтверждённые люди.

## 11. Официальные ссылки

- [Cloudflare Turnstile plans](https://developers.cloudflare.com/turnstile/plans/) и [server-side validation](https://developers.cloudflare.com/turnstile/get-started/);
- [Sumsub Short Video Fragment](https://docs.sumsub.com/docs/short-video-fragment), [check results и duplicate search](https://docs.sumsub.com/docs/user-verification-check-results), [pricing](https://sumsub.com/pricing/);
- [FaceTec liveness и Face Search](https://dev.facetec.com/quote), [Veriff plans](https://www.veriff.com/plans/self-serve);
- [World ID overview](https://docs.world.org/world-id/overview), [IDKit integration](https://docs.world.org/world-id/idkit/integrate), [World ID v4 migration](https://docs.world.org/world-id/4-0-migration);
- [MediaPipe Face Landmarker for web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js), [Web Speech API](https://www.w3.org/community/speech-api/);
- [NIST FRVT 1:N](https://pages.nist.gov/frvt/html/frvt1N.html), [NIST biometrics guidance](https://pages.nist.gov/800-63-3/sp800-63b.html).

Связанные внутренние документы: [MASTER_KANBAN.md](./MASTER_KANBAN.md), [AI_COORDINATOR_SYSTEM_GROWTH_PLAN.md](./AI_COORDINATOR_SYSTEM_GROWTH_PLAN.md), [OPEN_ABUNDANCE_MASTER_PLAN.md](./OPEN_ABUNDANCE_MASTER_PLAN.md), [PROJECT_MEMORY.md](./PROJECT_MEMORY.md), [DATABASE.md](./DATABASE.md), [USERS.md](./USERS.md), [CHALLENGES_CATALOG.md](./CHALLENGES_CATALOG.md), [TODAY_DAILY_CHALLENGE_PLAN.md](./TODAY_DAILY_CHALLENGE_PLAN.md).
