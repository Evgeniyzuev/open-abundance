# Open Abundance — AI Scale Handoff

> Рабочий handoff-документ для нового чата и следующего разработчика.
> Документ фиксирует текущий контекст, решения и направление реализации AI.
> Это не финансовый прогноз, не обещание доходности и не утверждение готовности всех перечисленных функций.

Дата фиксации: 2026-07-31  
Репозиторий: `F:\git\open-abundance`  
Канонический оперативный статус: `docs/MASTER_KANBAN.md`

## Как использовать этот документ

Перед изменением кода:

1. Прочитать `docs/DEVELOPMENT_RULES.md`.
2. Проверить `docs/MASTER_KANBAN.md`: одновременно активна только одна главная продуктовая карточка.
3. Сверить решение с `docs/PROJECT_MEMORY.md`, `docs/OPEN_ABUNDANCE_LORE.md` и `docs/OPEN_ABUNDANCE_MASTER_PLAN.md`.
4. Для AI-изменений дополнительно прочитать `docs/AI_CONTEXT_MEMORY_ARCHITECTURE.md` и этот документ.
5. Сначала сформировать decision-complete план, затем менять код, связанные документы и канбан одной итерацией.

## Project snapshot

Open Abundance — AI-координируемый слой над существующей экономикой. Система помогает человеку:

```text
желание → понятный путь → небольшое действие → подтверждённый результат
→ рост навыков, Trust, Core и возможностей → помощь следующему участнику
```

Главная пользовательская формула:

```text
полезные челленджи → рост Core → рост уровня → расчётное ежедневное начисление
→ новые возможности → видимый результат для участника и системы
```

Первый пилот — закрытая beta для примерно 20–50 русскоязычных пользователей. Основные группы:

- люди, ищущие дополнительный доход через полезную деятельность;
- люди, готовые вложить средства в интересный проект после понимания принципов, рисков и расчётов;
- фрилансеры, создатели, люди в смене профессии и те, кому нужен понятный путь к личной цели.

Основной пользовательский цикл:

```text
история → желание → финансовый план → Today → действие/награда
→ рост Core → публикация подтверждённого результата → возврат
```

Текущий канонический продуктовый шаг — Verified Reality Feed. Demo-истории, системные объясняющие главы и реальные verified results не должны смешиваться.

## Current implementation state

### AI уже реализован

- `lib/ai/providerGateway.ts` — единая серверная точка вызова провайдеров.
- Сейчас gateway поддерживает Gemini и Groq, включая fallback.
- Поддерживаются streaming text и JSON generation с валидацией результата.
- Системная инструкция передаётся отдельно от пользовательских сообщений.
- `lib/ai/knowledge.ts` — серверная версия общей базы знаний и capability-инструкций.
- Текущая версия знаний: `2026-07-31.1`.
- Текущие capabilities: `chat.general` и `reflection.process`.
- `lib/ai/clientContent.ts` содержит клиентский welcome и suggestions, чтобы серверный системный prompt не попадал в браузер.
- `/api/ai/chat` использует общий контекст и историю текущего чата.
- `/api/ai/reflections/step` использует тот же общий контекст, но только явно выбранную запись и ответы текущей сессии.

### AI chat stage 1 implemented — 2026-07-31

- `Home → Ideas` сохраняет один текущий draft и локальную историю чатов в общей IndexedDB `open-abundance-offline` (DB version 5); Supabase и AI API не изменялись.
- Добавлены 20 локализованных встроенных вопросов, панель `?`, quick actions и локальный статический персонаж Nova/Нова.
- Локальный UX-лимит составляет 20 отправок в UTC-сутки и 300 в UTC-месяц; повторная отправка блокируется до завершения streaming-ответа.
- Локальный лимит остаётся UX-подсказкой; серверная квота является источником истины на этапе 2.

### AI chat stage 2 implemented — 2026-07-31

- `/api/ai/chat` принимает текущий Supabase access token, использует `user.id` и не добавляет отдельный глобальный auth guard.
- Migration `20260731150000_ai_usage_quota_and_provider_health.sql` добавляет атомарную квоту `20/day` и `300/month` для `chat.general`, usage ledger без raw prompt/полного текста чата, per-user rate limit `6/min` и concurrency `1`.
- Quota резервируется перед вызовом провайдера; ошибка провайдера не возвращает сообщение в квоту, а фиксируется как metadata-only `failed` event. Вызов fallback считается одним пользовательским запросом.
- `ai_provider_health` хранит cooldown конкретного Gemini/Groq. Для HTTP 429 используется `Retry-After`, иначе применяется ограниченный exponential cooldown; fallback идёт только по доступным провайдерам.
- Migration `20260731150000_ai_usage_quota_and_provider_health.sql` применена к удалённому Supabase; migration BYOK ниже требует отдельного deploy после проверки доступности DB connection.
- Reflection сохраняет текущий контракт и не включён в chat quota; общий gateway health/fallback применяется и к reflection.

### AI chat stage 3 BYOK implemented — 2026-08-01

- В Ideas добавлены режимы `System quota` и `My OpenRouter`; по умолчанию сохраняется системный режим. BYOK не расходует системную квоту, но использует общий rate limit `6/min` и concurrency `1`.
- Подключение пока manual key only: OpenRouter API key шифруется server-side AES-256-GCM через deployment secret `AI_CONNECTION_ENCRYPTION_KEY`; клиент получает только masked metadata и не сохраняет key в IndexedDB.
- Добавлены server-side settings/key routes, consent fact, RLS без client policies и curated allowlist из трёх моделей. При ошибке OpenRouter нет автоматического перехода на Gemini/Groq.
- Reflection и чувствительные wellbeing-данные остаются в системном маршруте; OAuth/PKCE, произвольные Gemini/OpenAI/Anthropic keys и пользовательская долговременная память не входят в этот MVP.
- Локальная migration `20260801100000_ai_openrouter_byok.sql` подготовлена. Linked/direct DB push вернул `Connection error`; remote migration list подтверждает stage 2, но BYOK migration ещё не применена.

### AI пока не реализован

- Context Broker.
- Consent-контракт и отдельные пользовательские разрешения по scopes.
- Долговременная AI-память.
- OAuth/PKCE и прямые пользовательские ключи Gemini/OpenAI/Anthropic.
- Полный provider registry, capability-based routing, очереди, cost ceiling и token-based billing.
- Prompt/semantic caching и Batch-задачи.
- Remote MCP server Open Abundance.
- Интеграции с ChatGPT, Claude или Gemini CLI.

### Связанные текущие зоны приложения

- `app/api/user/context/route.ts` — server-backed пользовательский контекст.
- `app/api/today/route.ts` и `lib/serverToday.ts` — Today.
- `app/api/challenges/route.ts` и `components/ChallengesApp.tsx` — челленджи.
- `components/HomeTodayApp.tsx` — Home и primary CTA.
- `components/AiChatApp.tsx` — AI chat UI.
- `components/ReflectionProcessor.tsx` — Reflection UI.
- `lib/coreCalculator.ts` — расчёты Core.
- `lib/trust.ts` — Trust и подтверждения.
- `lib/httpCache.ts` — no-store правила для server-backed API.

## Decisions

### 1. Главная метрика роста

```text
Core участника i = Core_i
Total Core = Σ Core_i всех участников
Рост за период = Total Core_end − Total Core_start
```

Total Core — главная числовая метрика системы. Дополнительные показатели объясняют качество роста:

- участие и activation;
- число пользователей, у которых растёт Core;
- verified results и источник каждого начисления;
- доход, навыки, проекты и другие личные результаты;
- Trust, retention и качество команд;
- wellbeing и отсутствие выгорания;
- anti-abuse и Sybil protection;
- Wallet liabilities и coverage.

Total Core нельзя максимизировать любой ценой. Увеличение Core за счёт давления, накрутки, непроверенных наград, сокрытия рисков или ухудшения состояния участников считается некачественным ростом.

### 2. Core — абсолютный неснижаемый принцип

Core — внутренний неснижаемый капитал участника. Он определяет уровень и служит базой для расчётного ежедневного начисления.

Ни одно событие не может уменьшить уже накопленный Core:

- отрицательный или нейтральный quality-gate;
- пропуск действия или челленджа;
- ошибка системы или AI;
- breach, redemption или невыплата;
- изменение ликвидности или coverage;
- жалоба, смена направления или временная пауза.

Quality-gate может изменить только будущую нагрузку, темп, новые обязательства и рекомендации. Он не снижает Core, Wallet, уровень или уже выданные награды.

### 3. Core, Wallet и coverage

- Wallet — доступный внутренний баланс для внутренних переводов, пользовательских задач, торговли и будущего внешнего вывода.
- Core нельзя конвертировать обратно в Wallet.
- Текущая расчётная ставка: `0.0633% в день`; показывать её только как расчётную модель с явными предположениями, а не как гарантированную доходность.
- Источники Core должны фиксироваться раздельно: добровольный `Wallet → Core`, reinvest начислений, проверенные challenge/task rewards, лидерские и другие разрешённые системные награды.
- В beta системные и технические челленджи предполагают Core-награды, а не Wallet-награды и не фиатную зарплату.
- Внутренние операции, `Wallet → Core`, reinvest и системные Core-награды не зависят от нормы резервов.
- Coverage-gates применяются к новым Wallet-наградам, внешним выводам и другим новым выводимым обязательствам.
- Уже начисленный Wallet нельзя задним числом уменьшать из-за изменения ликвидности.
- `Wallet → Core` уменьшает Wallet liability и увеличивает Total Core, но само по себе не является новым внешним поступлением. Внешние пополнения и последующую конвертацию нужно измерять отдельно.

Базовая операционная метрика покрытия:

```text
withdrawable_wallet_liability = доступный Wallet + ожидаемые выводы
coverage_ratio = подтверждённые активы Treasury / withdrawable_wallet_liability
```

### 4. Quality-gate и wellbeing

Quality-gate наблюдает физическое, ментальное и эмоциональное состояние участника. Ежедневный check-in — чувствительный личный сигнал, а не рейтинг и не медицинская диагностика.

Правила:

- один негативный ответ не уменьшает Core, Wallet, уровень или награды;
- сложный день — обратная связь для адаптации маршрута, а не провал;
- форма check-in может периодически меняться, чтобы не превращаться в автоматическую формальность;
- сырые ответы, кризисные формулировки и выводы о диагнозах не сохраняются в AI memory автоматически;
- wellbeing по умолчанию private и не передаётся лидеру, команде или общему AI-слою;
- для серьёзных safety-сигналов приоритетом являются человеческая и экстренная помощь.

## Constraints

### Product constraints

- AI — помощник и координатор, а не начальник, автономный правитель, терапевт или замена человеку.
- Первый опыт должен постепенно раскрывать систему и вести к одному понятному действию.
- Ориентир «20 уровней / $1,000,000 Core» — образ и сценарий расчёта, а не обещание суммы, срока или результата.
- Команды строятся вокруг роста уровней участников и их индивидуальных маршрутов, а не вокруг приглашений сами по себе.
- Принятые технические задания дают Core после полезного и проверенного deliverable.
- Не использовать demo-истории как доказательство дохода или универсальный результат.

### Engineering constraints

- Серверные пользовательские GET-данные должны иметь `no-store`, `dynamic` и согласованную cache policy.
- Личные данные из IndexedDB не передаются AI автоматически; текущий объект отправляется только после явного действия пользователя.
- До появления consent-контракта нельзя объединять Home, chat, notes, wishes, finance, social и Reflection-контексты.
- Секреты провайдеров никогда не хранятся в браузере в открытом виде, логах, analytics payloads или `X-*` response headers.
- Любое новое AI-действие должно иметь capability, минимальный allowlist контекста, policy приватности и понятную границу автономности.
- Передача финансовых операций, Treasury, production secrets, экономических правил, mainnet и private data другого человека требует отдельного ограниченного flow и подтверждения.

### Project workflow constraints

- Канонический оперативный источник: `docs/MASTER_KANBAN.md`.
- Активна ровно одна главная продуктовая карточка.
- Путь карточки: `Очередь → Сейчас → Technical QA → User QA → Подтверждено`.
- Код без ручной UX-проверки не считается подтверждённым.
- После frontend-изменений разрешена одна попытка in-app browser; при известной ошибке среды переходить к fallback-проверкам и не повторять попытку.
- Для TypeScript/UI-контрактов использовать `pnpm exec tsc --noEmit`; для общих изменений — `pnpm lint` и релевантные тесты.

## AI scale strategy

### Chosen economic model

Использовать гибридную модель:

1. небольшая системная AI-квота для onboarding, FAQ и первого полезного результата;
2. пользовательский BYOK для активного и длительного использования;
3. позже — подписка, AI credits или другие понятные способы финансирования системной квоты;
4. нативные клиенты через MCP как дополнительный канал, где inference выполняет внешнее AI-приложение.

Системная квота должна иметь отдельный AI budget и не маскироваться под Core или Wallet. Челленджи могут вознаграждать полезный вклад в AI-инфраструктуру, но AI-расходы не должны автоматически становиться финансовым обязательством перед участником.

### Free providers

Не добавлять множество бесплатных прямых провайдеров как production-стратегию. Бесплатные tier-ы часто имеют переменные лимиты, отсутствие SLA, различающиеся политики данных, нестабильную доступность и частые изменения моделей.

Разрешённое использование бесплатных моделей:

- локальная разработка и eval;
- простые общие FAQ;
- best-effort режим без обещания доступности;
- background-классификация, если данные не чувствительные.

Не использовать free-route по умолчанию для Reflection, финансового планирования, персональной памяти и любых данных, для которых требуется строгая политика приватности.

### Provider gateway and registry

Сохранить один внутренний gateway и расширить его до registry/router, вместо того чтобы добавлять вызовы провайдеров в разные route handlers.

Целевой слой:

```text
capability request
  → consent/context envelope
  → policy check
  → quota and budget check
  → provider/model routing
  → timeout/retry/circuit breaker
  → validated result
  → usage metadata and audit event
```

Для каждого provider/model хранить конфигурацию:

- capability support;
- streaming/JSON/tool support;
- цена и лимиты;
- latency and quality tier;
- data retention/training policy;
- разрешённые scopes;
- допустимые fallback-провайдеры;
- статус и дата последней проверки.

### Routing rules

| Сценарий | Маршрут по умолчанию | Ограничение |
|---|---|---|
| FAQ и объяснение концепции | дешёвая быстрая модель | можно использовать ограниченный free-route |
| Подбор Today/challenge | системная модель | минимальный пользовательский контекст |
| Финансовый план | более сильная модель + кодовый калькулятор | AI не является источником арифметики |
| Reflection | private/no-training provider | только выбранная запись и ответы сессии |
| Фоновая генерация и eval | queue + Batch | не использовать для live UX |
| MCP-запрос | модель внешнего клиента | сервер проверяет scopes и подтверждения |

Fallback допустим только при совместимой политике приватности. Нельзя автоматически отправлять чувствительный запрос от private-провайдера в бесплатный или неизвестный aggregator route.

### Scaling mechanisms

Обязательные механизмы gateway:

- per-user/day/month quota;
- общий budget ceiling и аварийное отключение дорогих классов;
- concurrency limit;
- очередь с backpressure;
- timeout, bounded retry с jitter и circuit breaker;
- idempotency для фоновых заданий;
- max input/output tokens;
- compaction и summary длинных диалогов;
- выбор релевантных знаний через RAG вместо передачи всей базы;
- prompt caching для стабильной части prompt;
- response/semantic cache только для общих неперсональных запросов;
- Batch API для evals, классификации, индексации, генерации каталогов и других неинтерактивных задач;
- deterministic code для Core, Level, Wallet, coverage и финансовых расчётов.

Не логировать raw prompt, Reflection text и полный пользовательский контекст. В usage ledger достаточно provider, model, capability, token counts, cost, latency, status, route и policy version.

## BYOK: OpenRouter first

### Chosen approach

Первый пользовательский канал — OpenRouter. Он даёт единую точку доступа к разным моделям и provider routing, а также поддерживает BYOK и OAuth PKCE.

Основной UX:

```text
Настройки AI → Подключить OpenRouter
→ OAuth/PKCE → пользователь подтверждает приложение
→ callback получает одноразовый code
→ backend обменивает code на user-controlled API key
→ ключ шифруется и сохраняется server-side
```

Ручной ввод ключа оставить как резервный путь для advanced users.

### Secret handling

- ключ пользователя шифруется перед записью в БД;
- master encryption secret хранится в deployment secret/KMS, не в коде и не в БД;
- в UI и API возвращаются только provider, статус, masked identifier, limits и last-used metadata;
- plaintext key не попадает в logs, analytics, errors, traces и клиентскую базу;
- пользователь может отключить соединение и запросить отзыв ключа на стороне OpenRouter;
- для каждого запроса применяется пользовательский лимит и допустимый model allowlist;
- при отсутствии ключа приложение использует системную квоту или безопасно сообщает о лимите;
- BYOK не означает согласие на передачу всех пользовательских данных: scopes и policy остаются обязательными.

### Later direct providers

Прямые ключи OpenAI, Anthropic, Google, xAI и DeepSeek добавлять только после:

- eval-набора по реальным capabilities;
- проверки цены и лимитов;
- проверки data policy и региональных требований;
- определения отдельного UX хранения/revoke;
- подтверждения, что OpenRouter не решает задачу с приемлемым качеством.

## Context, consent and privacy

### Target context formula

Каждый AI-вызов должен собираться так:

```text
общие правила и знания продукта
  + разрешённый контекст пользователя
  + подтверждённая память
  + контекст capability
  + явно выбранный объект
  + текущий запрос
```

Ни одна capability не получает все данные автоматически.

### Proposed scopes

| Scope | Пример данных | По умолчанию |
|---|---|---|
| `profile.public` | display name, public description | разрешён только для public use |
| `profile.private` | настройки и private profile | denied |
| `wishes.selected` | выбранное желание | ask/selected |
| `tasks.selected` | текущая задача | ask/selected |
| `tasks.history` | история задач | denied |
| `reflections.selected` | одна выбранная запись | ask/selected |
| `reflections.history` | история Reflection | denied |
| `finance.summary` | Level, агрегированный Core/Wallet | ask/limited |
| `finance.transactions` | операции и переводы | denied |
| `social.public` | опубликованный контент | allowed only by purpose |
| `direct_messages` | личная переписка | denied |
| `memory.confirmed` | подтверждённые memory items | ask/limited |
| `wellbeing.current` | минимальная текущая сводка | private/selected |
| `wellbeing.raw` | сырые check-in ответы | denied by default |

Публичность внутри Open Abundance не является автоматическим согласием на передачу данных внешнему AI-провайдеру.

### Autonomy ladder

```text
explain → suggest → prepare for confirmation → execute within explicit limits
```

Trust, полученный в одной capability, не открывает другие capabilities. Любое действие, меняющее данные, награды, публикации, деньги, команду или права доступа, должно иметь отдельный confirmation flow.

## Native AI integrations and MCP

Создать удалённый MCP server Open Abundance с OAuth, scopes, allowlist tools, audit metadata и подтверждением рискованных действий.

### First read-only tools

- `explain_open_abundance`
- `get_my_profile_summary`
- `get_my_level_and_core`
- `get_my_today`
- `list_my_available_challenges`
- `get_my_growth_plan`
- `calculate_core_scenario`

Не включать в первую версию:

- raw Reflection и wellbeing history;
- Wallet transfers, top-ups и withdrawals;
- Core/Reward mutation;
- публикацию от имени пользователя;
- чтение другого человека или private team data;
- изменение экономических правил.

### Platform matrix

| Клиент | Теоретическая возможность | Решение |
|---|---|---|
| ChatGPT | Plugin/Apps-поверхность с MCP server, OAuth и optional UI | приоритетный внешний канал |
| Claude | Remote MCP custom connector | следующий кандидат |
| Gemini | Remote MCP подтверждён для Gemini CLI | поддержать после базового MCP |
| Gemini app | публичный arbitrary-MCP канал не считать гарантированным без отдельного подтверждения | не блокировать архитектуру |
| Grok/xAI | использовать API; native app route считать экспериментальным | provider adapter позже |
| DeepSeek | API-совместимый провайдер; native app route не считать установленным | low-cost adapter позже |
| OpenRouter | aggregator, provider router и BYOK | первый пользовательский provider layer |
| Local models | Ollama/LM Studio или companion agent | поздний privacy/cost слой |

Важно различать два сценария:

1. Open Abundance вызывает API — расходы и лимиты относятся к gateway Open Abundance или ключу пользователя.
2. ChatGPT/Claude/Gemini CLI вызывает MCP Open Abundance — inference выполняет внешний клиент, а Open Abundance обслуживает tools, auth и данные.

Подписка ChatGPT не является API-балансом для запросов из Open Abundance; API billing OpenAI управляется отдельно.

## Proposed interfaces

Названия можно уточнить при реализации, но границы должны сохраниться.

### Internal types

```ts
type AiCapability =
  | "chat.general"
  | "reflection.process"
  | "home.next_action"
  | "wish.plan"
  | "task.plan"
  | "social.draft";

type AiDataScope =
  | "profile.public"
  | "profile.private"
  | "wishes.selected"
  | "tasks.selected"
  | "tasks.history"
  | "reflections.selected"
  | "reflections.history"
  | "finance.summary"
  | "finance.transactions"
  | "social.public"
  | "social.private"
  | "direct_messages"
  | "memory.confirmed"
  | "wellbeing.current"
  | "wellbeing.raw";

type ProviderPolicy = {
  provider: string;
  model: string;
  capabilities: AiCapability[];
  allowedScopes: AiDataScope[];
  privacyClass: "public" | "private" | "zdr";
  qualityTier: "economy" | "standard" | "strong";
  supportsStreaming: boolean;
  supportsJson: boolean;
};
```

### Data entities

- `user_ai_connections` — encrypted provider connection, owner, provider, status, masked metadata and timestamps.
- `ai_provider_policies` — allowed models, capabilities, scope rules, fallback and pricing metadata.
- `ai_usage_events` — capability, route, provider/model, token counts, cost, latency, status and policy version; no raw prompt.
- `ai_budgets` — system, user and capability-level ceilings.
- `ai_consents` — scope, purpose, status, version, created/revoked timestamps.
- `ai_memory_items` — only confirmed user memory, with source, scope, status and expiry/review policy.
- `mcp_audit_events` — external client, user, tool, scope, confirmation and result metadata.

### Route-level behavior

Current `app/api/ai/*` routes should remain capability owners. Gateway should own provider selection, quota, fallback and usage metadata. Route handlers should own validation, consent requirements and response contracts.

Potential future endpoints:

- `GET /api/ai/settings`
- `POST /api/ai/openrouter/connect/start`
- `GET /api/ai/openrouter/connect/callback`
- `DELETE /api/ai/connections/:id`
- `GET /api/ai/usage`
- `GET /api/ai/consents`
- `POST /api/ai/consents`
- `POST /api/mcp` or a dedicated remote MCP transport route

Exact wire schema must be designed together with the database migration and auth model; do not introduce secret fields into client-visible types.

## Implementation Steps

### Phase 0 — protect the current baseline

- Preserve current Gemini/Groq behavior.
- Add provider/model/capability metadata without changing user-visible prompts unexpectedly.
- Add structured usage metadata and no-raw-content logging.
- Add hard system quota and safe error states.
- Add tests for provider failure, invalid JSON, empty response and no-provider configuration.

### Phase 1 — registry and routing

- Introduce provider adapter interface.
- Move hardcoded models to a server-side registry/config.
- Add capability and privacy policy checks.
- Add route selection by task class, quality tier and data scope.
- Add compatible fallback rules.

### Phase 2 — cost and throughput controls

- Add per-user and per-capability quotas.
- Add concurrency limits and queue/backpressure.
- Add timeout, bounded retries, jitter and circuit breaker.
- Add prompt compaction, relevant-context selection and safe public response cache.
- Add Batch workers for noninteractive tasks.
- Add operational metrics: success rate, latency, provider failures, quota exhaustion, estimated cost and quality feedback.

### Phase 3 — OpenRouter BYOK

- Implement manual OpenRouter key connection first; keep OAuth PKCE deferred.
- Store only encrypted user-controlled key with KMS/deployment secret.
- Add connection status, masked metadata, revoke/delete and usage display.
- Add model allowlist, user budget and no-secret logging tests.
- Route only permitted capabilities through the connection.

### Phase 4 — Context Broker and consent

- Define context envelope and scopes.
- Implement purpose-bound consent.
- Add selected-object flow for local IndexedDB data.
- Add confirmed memory lifecycle and review/expiry rules.
- Ensure Reflection/wellbeing data remains private unless explicitly selected.

### Phase 5 — MCP distribution

- Build read-only remote MCP server.
- Add OAuth, scopes and audit events.
- Add tool metadata written for gradual discovery and one clear next action.
- Add confirmation-required mutation tools only after read-only usage is stable.
- Test ChatGPT, Claude and Gemini CLI integrations separately.

### Phase 6 — direct providers and local models

Add direct OpenAI, Anthropic, Google, xAI, DeepSeek or local adapters only after evals demonstrate a concrete advantage in quality, cost, latency, privacy or availability.

## Acceptance criteria

### Product

- New user can use basic AI without configuring a provider.
- User can understand current quota and why a request was limited.
- User can connect and revoke OpenRouter without exposing a plaintext key to the UI.
- AI does not imply guaranteed income, investment return or universal route.
- AI always preserves the Core non-decrease invariant.
- AI does not silently receive finance, Reflection, wellbeing or social-private context.

### Security and privacy

- No API keys in source, browser storage, logs, traces, errors or analytics.
- No raw Reflection/wellbeing content in generic AI telemetry.
- Sensitive scopes cannot be reached through a public/free provider policy.
- MCP tool calls are authenticated, scoped and audited.
- Mutating tools require explicit confirmation.
- A provider failure cannot trigger a second provider with weaker privacy policy.

### Reliability and cost

- System budget ceiling is enforced server-side.
- Per-user and concurrent request limits are enforced before provider call.
- Timeouts and retries do not multiply cost without an idempotency strategy.
- Fallback works for compatible providers and returns a clear degraded-mode response otherwise.
- Non-AI features continue working when quota is exhausted or all providers fail.

## Test plan

### Unit and contract tests

- provider adapter success/failure/timeout;
- JSON schema validation and malformed provider output;
- streaming parsing for Gemini and OpenAI-compatible responses;
- capability-to-scope policy checks;
- quota and budget calculations;
- fallback compatibility;
- encrypted connection serialization without plaintext leakage;
- Core invariants remain true after every AI-related event.

### Integration tests

- OpenRouter OAuth PKCE callback and failed/revoked connection;
- user-level budget and model allowlist;
- queue backpressure and retry/circuit-breaker behavior;
- no-store behavior for user-specific AI endpoints;
- MCP authentication, read-only tools, denied scope and confirmation flow.

### Manual scenarios

1. New user asks a general question and receives a useful answer within system quota.
2. User reaches quota and sees an understandable next option.
3. User connects OpenRouter, chooses a model, makes a request and revokes access.
4. Reflection request receives only the selected record, not other notes or finance.
5. Negative quality-gate response changes future recommendation intensity but not Core, Wallet, Level or rewards.
6. Provider outage falls back only to a permitted provider.
7. External AI client reads Today through MCP but cannot transfer Wallet or publish without confirmation.

## Open Questions

These questions must be resolved before the corresponding implementation phase, not guessed inside code:

- Exact initial free AI quota: requests, tokens, or capability credits?
- What is the monthly system AI budget and who can change it?
- Which KMS/secrets mechanism is available in the current deployment?
- Which OpenRouter models are approved for public, private and ZDR routes?
- What eval dataset and minimum quality threshold define a provider as production-ready?
- Which data-retention and regional policies are acceptable for Russian-speaking pilot users?
- Should AI credits be purchased, earned through challenges, included in a subscription, or combined?
- Which MCP write actions, if any, are included in the first public integration?
- Who reviews MCP publication, OAuth scopes, security and external platform compliance?
- When does a provider qualify for a direct adapter instead of OpenRouter?
- Which operations are operator-confirmed, leader-confirmed or user-confirmed?

## Related project documents

### Canonical product and strategy

- [`docs/OPEN_ABUNDANCE_LORE.md`](./OPEN_ABUNDANCE_LORE.md)
- [`docs/OPEN_ABUNDANCE_MASTER_PLAN.md`](./OPEN_ABUNDANCE_MASTER_PLAN.md)
- [`docs/OPEN_ABUNDANCE_SYSTEM_GROWTH_PLAN.md`](./OPEN_ABUNDANCE_SYSTEM_GROWTH_PLAN.md)
- [`docs/PROJECT_MEMORY.md`](./PROJECT_MEMORY.md)
- [`docs/MASTER_KANBAN.md`](./MASTER_KANBAN.md)
- [`docs/NEXT_TASK_CONTEXT.md`](./NEXT_TASK_CONTEXT.md)

### AI, privacy and implementation rules

- [`docs/AI_CONTEXT_MEMORY_ARCHITECTURE.md`](./AI_CONTEXT_MEMORY_ARCHITECTURE.md)
- [`docs/DEVELOPMENT_RULES.md`](./DEVELOPMENT_RULES.md)
- [`docs/DATABASE.md`](./DATABASE.md)
- [`docs/USERS.md`](./USERS.md)
- [`docs/CHALLENGES_CATALOG.md`](./CHALLENGES_CATALOG.md)
- [`docs/TRUST_RECIPROCITY_MARKET_PLAN.md`](./TRUST_RECIPROCITY_MARKET_PLAN.md)
- [`docs/REFERRALS_TEAMS_PLAN.md`](./REFERRALS_TEAMS_PLAN.md)

## Official external sources

Checked for the architecture discussion on 2026-07-31. Provider limits, pricing, product availability and platform review requirements can change; re-check before implementation or launch.

### OpenAI

- [Batch API](https://developers.openai.com/api/docs/guides/batch)
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [ChatGPT subscription and API billing](https://help.openai.com/en/articles/8156019-is-api-usage-included-in-chatgpt-subscriptions-even-if-i-have-a-paid-chatgpt-account)

### Anthropic

- [Custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Claude pricing and prompt caching](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Claude MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)

### Google Gemini

- [Gemini API pricing and free-tier data policy](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [Gemini context caching](https://ai.google.dev/gemini-api/docs/caching)
- [Gemini CLI MCP servers](https://geminicli.com/docs/tools/mcp-server/)

### OpenRouter

- [BYOK](https://openrouter.ai/docs/guides/overview/auth/byok)
- [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Provider logging and retention](https://openrouter.ai/docs/guides/privacy/provider-logging/)
- [Free models FAQ](https://openrouter.ai/docs/faq)

### xAI and DeepSeek

- [xAI rate limits](https://docs.x.ai/developers/rate-limits)
- [xAI pricing](https://docs.x.ai/developers/pricing)
- [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek rate limits](https://api-docs.deepseek.com/quick_start/rate_limit)

## Handoff conclusion

The next implementation should extend the existing shared gateway into a policy-aware AI infrastructure layer. The first practical milestone is not adding many providers; it is making usage measurable, bounded, privacy-aware and user-extensible through OpenRouter BYOK. MCP should then distribute Open Abundance capabilities into users' existing AI clients without coupling the product to one model vendor.

The implementation must preserve the project's central rule:

> Growth is valuable only when it increases participant opportunity while preserving Core, trust, privacy, wellbeing and operational sustainability.
