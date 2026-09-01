# Open Abundance Master Kanban

Этот документ — единственный канонический источник оперативного статуса Open Abundance. Конкретные решения живут в `OPEN_ABUNDANCE_MASTER_PLAN.md`, накопительный контекст — в `PROJECT_MEMORY.md`; тематические планы не меняют порядок работы в этом канбане.

## Правила работы

- Одновременно в `Сейчас` находится ровно одна главная продуктовая карточка.
- Путь карточки: `Очередь -> Сейчас -> Technical QA -> User QA -> Подтверждено`.
- Написанный код не равен готовому продукту. Без ручной проверки сценария карточка остается в `Технически реализовано / нужен User QA`.
- Перед реализацией следующей карточки фиксируется короткий decision-complete план.
- Код, связанный продуктовый документ и этот канбан обновляются в одной итерации.
- Новые идеи идут в очередь и не прерывают текущий шаг, кроме критических ошибок и угрозы деньгам или данным.
- После frontend-изменений выполняется одна попытка визуальной проверки в in-app browser. Если он недоступен, это явно фиксируется вместе с результатами технических проверок.

## Формат активной карточки

Активная карточка содержит:

- пользовательский результат;
- причину приоритета;
- конкретные изменения;
- что не входит в шаг;
- критерии приемки;
- технические проверки;
- ручной UX-сценарий;
- продуктовую метрику;
- найденные блокеры;
- ссылку на подробный план, если он нужен.

## Сейчас

### Trust v2 Shadow v1

- **Статус:** Сейчас — внутренний детерминированный shadow calculation; публичный Trust, пользовательский UI и влияние на Core/Wallet/Skills запрещены.
- **Конфигурация:** versioned `trust-shadow-v1`: rating `0.0–5.0` с шагом `0.1` и нейтральной точкой `3.0`, starter `0.25`, `A=100`, `c=1`, `beta=0.25`, amount cap `9`, pair cap `2 + 0.25 × Core Level`, окно `365` дней, rater share `10%`, annual decay `0.9`.
- **Граница шага:** только service-only таблицы, атомарный rebuild и aggregate operator report; corrections, private owner summary, qualitative badges и public scale остаются следующими этапами.
- **Источники:** только published reviews завершённых и оплаченных сделок; hidden/flagged, refunded/cancelled/unresolved и неподтверждённые суммы исключаются, Trust-lite учитывается лишь диагностически.
- **Критерий завершения:** deterministic contract test, typecheck/lint/build и проверка operator auth; remote migration apply, анализ реального распределения и ручной QA остаются отдельными gate’ами.
- **Обновление 2026-09-01:** review contract синхронизирован на `0.0–5.0` с шагом `0.1`; corrective migration и remote Technical QA ещё не закрыты.
- **Связанные документы:** `docs/TRUST_RECIPROCITY_MARKET_PLAN.md`, `docs/REFERRALS_TEAMS_PLAN.md`, `docs/MARKETPLACE_ESCROW_PLAN.md`.

## Завершённая карточка — Skill Passport

### Skill Passport + automatic skill levels

- **Статус:** Подтверждено пользователем 2026-08-02 — ручной User QA пройден; automatic-checks-first срез закрыт как выполненная задача.
- **Пользовательский результат:** пользователь открывает Skill Passport, видит уровни и прогресс по referral, public content и team facts, а после действия запускает автоматическую проверку.
- **Граница шага:** RPG-блок Skill Passport и автоматические L1 для referral acquisition, content creation и team building. Submission, evidence, human review, peer point, сертификаты, AI-matching и публичный Trust не входят.
- **Ручной UX-сценарий:** открыть Skill Passport → сделать referral, public post или активировать team relation → нажать «Проверить прогресс» → увидеть current value, threshold и новый earned/effective level; сценарий принят пользователем.
- **Технический статус:** deterministic checks, typecheck, lint и build были пройдены; дальнейшие уровни и human review остаются вне текущей очереди.
- **Связанный документ:** `docs/SKILLS_SYSTEM_PLAN.md`.

## Технически реализовано / нужен User QA

### User Content Growth Loop

- **Статус:** Технически реализовано / нужен User QA — кодовый срез и remote migration реализованы 2026-08-02; ручной User QA и bounded HTTP smoke остаются отдельными шагами.
- **Пользовательский результат:** пользователь публикует собственное фото/короткое видео о результате, получает простую реакцию и комментарий, а затем может безопасно переиспользовать историю в каноническом repost и внешнем share package.
- **Почему сейчас:** Verified Reality Feed уже подтверждён пользователем; следующий риск — лента остаётся в основном server-backed/demo-контуром без простого first-party action-loop.
- **Главное решение:** начать с ручного поста, одной реакции `like`, простых комментариев и canonical repost без копирования media; Daily Progress и outbound share package остаются частью одного короткого loop.
- **Граница шага:** first-party фото/короткое видео, ручной post, одна реакция, комментарии, canonical repost, Daily Progress и outbound share package с external mirror. Full follows graph, replies, saves, автоматическая модерация, moderation queue, автоматический кросс-постинг и полноценный short-video pipeline не входят; проблемный материал обрабатывается вручную только при необходимости.
- **Decision-complete план:** зафиксирован 2026-08-02 в `docs/FEED_POSTING_RECOMMENDATIONS_PLAN.md`: private `feed-media`, один image/video-файл на пост, лимиты 8 MB image или 30 секунд/25 MB MP4, public/private visibility, privacy guard, idempotent like/comment/repost и manual share flow.
- **Технические проверки:** `pnpm exec tsc --noEmit`, `pnpm lint`, эскалированный `pnpm build` и REST read-only check новой таблицы пройдены 2026-08-02; in-app browser недоступен в текущей сессии, migration `20260802120000_user_content_growth_loop.sql` применена remote.
- **Ручной UX-сценарий:** создать post с фото/коротким видео → опубликовать → открыть в `People → Feed` → поставить `like` и оставить комментарий → сделать canonical repost → собрать outbound share package и открыть external mirror.
- **Метрика:** доля активированных пользователей с первым first-party post, доля post с реакцией/комментарием, доля canonical repost без дублей и переходы из share package во внешний mirror.
- **Блокеры:** продуктовый blocker по границам снят decision-complete планом; User QA потребуется после реализации. Автоматическая модерация и moderation queue сознательно не планируются.
- **Связанный документ:** docs/FEED_POSTING_RECOMMENDATIONS_PLAN.md.

## Завершённая карточка — Verified Reality Feed

### Verified Reality Feed

- **Статус:** Подтверждено пользователем 2026-08-02 — 23 server-backed demo posts реализованы, 10 согласованных demo-текстов обновлены, 12 system stories опубликованы; профиль `Abundance System` реализован, real verified `Challenge Done` реализован (migration `20260724220000` применена, API/UI интеграция и privacy guard добавлены), draft-first сценарий пройден.
- **Пользовательский результат:** в `People → Feed` пользователь различает fictional `Демо-истории`, системные объясняющие главы `Abundance System` и ручной контент по автору, аватару и отдельным бейджам; у всех demo и system stories есть изображения.
- **Почему сейчас:** Notes и Home/Today уже поддерживают личное действие, а receipt подтверждает награду; следующий риск — пользователь не видит накопленный результат и не получает безопасного социального сигнала для возвращения.
- **Главное решение:** Verified Reality Feed остается вторичной вкладкой `People → Feed`; первый slice строится только из server-backed completion факта challenge и метаданных challenge, без суммы reward/ledger и финансовых обещаний. `Демо`, системно подтвержденные факты и ручной пользовательский контент никогда не смешиваются.
- **Narrative direction для demo:** герой начинает из точки боли и ощущения тупика, случайно узнает об Abundance, сначала пробует из любопытства, а затем через маленькие последовательные шаги замечает, что у него появляются ясность, опора и реальный выбор. Финал — личное ощущение «я могу изменить свою жизнь», а не обещание гарантированного дохода или универсального успеха.
- **Новая editorial direction для системных историй:** в рамках Reality Feed подготовлена отдельная последовательная серия от аккаунта `Abundance System`. Она объясняет устройство и замысел системы, но не выдается за verified research и не смешивается с demo-историями или реальными `Challenge Done`.
- **Системный аккаунт и порядок:** в БД создан `Abundance System`, главы имеют server-backed порядок `1–12`, тип `system_story`, отдельный бейдж и фото 4:5; имя/аватар и ссылка `Все главы` открывают отдельный профиль с возвратом в позицию ленты. Подробности — `docs/REALITY_FEED_SYSTEM_STORIES_PLAN.md`.
- **Граница текущего шага:** системные истории объясняют позицию проекта, но не получают verified badge; отдельный source pack не блокирует slice. `Challenge Done` создаётся один раз как verified draft, а после публикации становится публичной карточкой; ручной сценарий подтвержден пользователем.
- **Изменения:**
  - добавить migration `20260715120000_reality_feed_demo_posts.sql`: `post_type = reality_demo`, системный `source_key`, локализованные тексты и 23 идемпотентных `feed_posts`;
  - добавить общую схему `feed_post_media` для изображений/видео Reality Feed и `feed_post_translations` для RU/EN body/author name;
  - читать demo body/media через существующий no-store feed API и показывать их в общем `PostList`, а не отдельным локальным блоком;
  - переписать истории от первого лица, убрать объясняющие `milestones/outcome` и сохранить визуальную маркировку `Демо-история`;
  - применить migration `20260719123000_reality_feed_updated_demo_and_system_stories.sql`: обновить 10 demo-текстов, добавить системный аккаунт, 12 ordered system stories, RU/EN-переводы и 12 изображений;
  - сделать server-backed read model или безопасную проекцию для `Challenge Done`, не используя `product_events` как публичный источник истины — реализовано через `challenge_completion_snapshots`;
  - обеспечить один системный пост/snapshot на один user challenge completion и сохранить source type/id — реализовано уникальным snapshot и feed link;
  - показать verified badge, автора, challenge title, verification type, completed date и короткий CTA в challenge/Today — реализовано в Feed API/detail/gallery;
  - явно маркировать verified draft в личных `Черновики событий` и объяснить, что публикация добавит результат в `People → Feed` — реализовано в `SystemDraftEditor`;
  - объяснить следующий шаг в пустой общей ленте и дать CTA в challenge — реализовано в actionable empty state для `People → Feed`;
  - замкнуть completion → receipt → verified drafts без ручного поиска вкладки — реализовано прямым CTA из completion receipt и автооткрытием `Blog → Drafts`;
  - после публикации verified draft автоматически вернуть пользователя в `People → Feed`, где результат виден сразу — реализовано в `publishPost`;
  - убрать все бейджи с плиток-обложек и оставить `verified`, `Демо-история`, `История Abundance` и другие маркировки только внутри detail — реализовано;
  - добавить отдельные demo fixtures/cards с явной маркировкой `Демо`, не выдавая их за реальные истории;
  - сохранить visibility-проверки и no-store feed API; пользовательский текст/медиа остаются отдельным типом контента без verified badge.
- **Не входит:** reward amount и ledger/финансовые данные, Wallet-выплаты, рекомендации `For You`, полноценные comments/reactions/follows, видео, сложный Hero Path, автоматическое создание истории из всех daily accruals и изменение стартового `Goals → Notes` маршрута.
- **Критерии приемки:** 23 demo stories приходят из Supabase как отдельные обычные посты, локализуются по языку интерфейса, содержат изображение и явную маркировку; verified `Challenge Done` создаётся ровно один раз после completion и появляется в общем feed после публикации; в карточке нет неподтвержденных финансовых утверждений; ручной пост не получает verified badge; чужие private/draft snapshots недоступны; пустая лента объясняет следующий шаг; CTA открывает challenge/Today.
- **Технические проверки:** review существующих `feed_posts`/`progress_snapshots`/stat blocks, migration/API contract review, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` и bounded HTTP smoke app shell. Все перечисленные команды пройдены; HTTP smoke вернул 200, visibility/no-store подтверждены route contract и read-only data checks.
- **Ручной UX-сценарий:** пользователь подтвердил 2026-08-02: завершить Core challenge → `Открыть черновик` → `Blog → Drafts` → опубликовать → `People → Feed` → обновить и проверить отсутствие дубля; verified metadata и detail CTA остаются внутри раскрытия карточки.
- **Метрика:** доля завершивших challenge пользователей, увидевших verified result; доля verified карточек без дублей; переходы из карточки в следующий challenge/Today; доля demo-контента, который пользователь правильно отличает от реального.
- **Блокеры:** продуктовый и технический blocker не найден; ручной User QA подтверждён. Challenge reward/ledger source сознательно не входит в этот этап.
- **Связанные документы:** `docs/FEED_POSTING_RECOMMENDATIONS_PLAN.md`, `docs/PROJECT_MEMORY.md`, `docs/NEXT_TASK_CONTEXT.md`.

## Параллельный операционный трек — первая когорта

Это не вторая карточка разработки и не меняет правило одного шага в `Сейчас`. Этот операционный трек идёт параллельно активной технической карточке и не требует изменения кода.

### Pilot Activation Loop: Day 0 / Day 1

- **Статус:** переведён в параллельный операционный трек 2026-08-02.

- [ ] Связать onboarding, Demo/Verified, App Testing, желание, финансовый план, daily goal, первый challenge/receipt и возврат.
- [ ] Закрыть server-side события и проверить первую партию 5–10 человек.
- [ ] Оставить финансовый и referral-треки добровольными и включать их после первого результата.

Основатель может одновременно:

- [ ] составить список первых 5–10 людей из тёплой сети и приглашать партиями, затем расширять закрытую когорту до 20–50;
- [ ] подготовить одно честное сообщение: beta, результат первых 24 часов, Core/Wallet без гарантий, ссылка и следующий шаг;
- [ ] назначить короткие сопровождаемые сессии Day 0/Day 1 и фиксировать причину каждого отказа или застревания;
- [ ] измерять `registration → wish+plan → first result → D1`, а не регистрации или просмотры сами по себе;
- [ ] не требовать deposit, Wallet -> Core, withdrawal или referral для обязательной активации.

Канонический маршрут и каналы: `docs/OPEN_ABUNDANCE_SYSTEM_GROWTH_PLAN.md`; outreach блогерам: `docs/BLOGGER_OUTREACH_PLAN.md`.

## Следующие шаги

1. [X] **User Content Growth Loop — кодовый MVP**

    - First-party фото/короткое видео, ручной post, одна реакция `like` и простые комментарии.
    - Canonical repost без копирования media, Daily Progress и outbound share package с external mirror.
    - Осталось: провести bounded HTTP smoke и ручной User QA; автоматическая модерация и moderation queue не планируются.
    - Связанный документ: `docs/FEED_POSTING_RECOMMENDATIONS_PLAN.md`.
2. [X] **Skill Passport + automatic skill levels**

    - Server-authoritative refresh и автоматические уровни по referral, public content и team facts.
    - Ручной User QA подтверждён пользователем 2026-08-02; human review, evidence и certificates не входят.
    - Связанный документ: `docs/SKILLS_SYSTEM_PLAN.md`.
3. [X] **Team / Referral / Leader Loop**

    - Локальная функциональная реализация Team Help Loop v1 завершена: team dashboard, помощь новичку, лидерские челленджи, task API/RLS, quality-referral агрегаты и Direct.
    - Функционально выполнено; remote migration применена, ручной QA остаётся отдельным acceptance gate. Invite challenge открывается после первого подтверждённого non-onboarding результата, Skill Passport использует activated/retained D7.
    - Связанные документы: `docs/REFERRALS_TEAMS_PLAN.md`, `docs/LEADER_GROWTH_PROGRAM.md`.
4. [X] **User economy metrics + participation shadow**

    - Функционально выполнено локально: challenge reward normalization, rebuildable `user_economy_metrics`, reconciliation/RLS, private APIs, Wallet UI и safe opt-in aggregates. Remote migration применена; reconciliation run и buyer/seller QA остаются gate.

    - `participation_balance = marketplace_purchases_gross - marketplace_sales_gross`; Wallet transfers и внешние flows его не меняют.
    - Marketplace остаётся отдельным неподтверждённым buyer/seller QA-gate и выведен из активной очереди разработки.
    - Связанный документ: `docs/MARKETPLACE_ESCROW_PLAN.md`.
5. [ ] **Trust v2 private summary + calibrated public pilot**

    - Следующий этап после Shadow v1: private summary → calibrated public pilot только после отдельного решения по калибровке и anti-abuse.
    - Связанный документ: `docs/TRUST_RECIPROCITY_MARKET_PLAN.md`.
6. [ ] **Future Sim**

    - Сначала честная статичная simulation с формулой, watermark и opt-in; face/video позже.
    - Стартует только после устойчивого workflow, калькулятора и подтверждённого D1/D3/D7.
    - Связанный документ: `docs/FUTURE_SIM_PLAN.md`.
7. [ ] **Humanity confirmation onboarding challenge**

    - Спроектировать заметный шаг «Подтверждение человечности» в onboarding и Today; не считать Google-вход или обычную активность подтверждением.
    - Рассмотреть короткий phone liveness: лицо по центру и случайные повороты влево/вправо; усиленный вариант — случайные цифры вслух во время короткой видеозаписи. Полный оборот головы на 360° не требуется.
    - Не хранить raw face/voice в обычной базе приложения: предпочтительны внешний provider/attestation, минимальный статус, версия проверки и timestamp; обязательны ручная доступная альтернатива и ограничение повторов.
    - Сделать шаг ключевым через прогресс и открытие anti-abuse-sensitive функций, включая системные rewards и реферальные выплаты, но не блокировать базовый доступ и вывод собственных средств.
    - Acceptance: согласованный UX, threat model replay/deepfake/injection/multiaccount, provider-vs-build решение, recovery flow и только после этого отдельная схема данных и реализация.
    - До выполнения карточки `humanity_confirmed_accounts` отсутствует в текущем growth report и не выводится из регистраций.
    - Связанный план: [`docs/HUMANITY_VERIFICATION_PLAN.md`](./HUMANITY_VERIFICATION_PLAN.md). План согласован; vendor/legal gate, миграция и реализация остаются pending.

9. [ ] **Capital efficiency observability + Total Core capacity**

    - Собрать детерминированный read model и сценарный калькулятор для `Total Core / Free Reserve`, `coverage`, `Net Wallet Settlement`, внешней доли расчётов и runway 7/30/90 дней.
    - Отдельно считать максимум обязательств в стресс-сценарии: ставка `0.000633`, максимальная Wallet-доля, Green buffer `125%`, открытые claims и `breach_exit`; Wallet-to-Wallet перевод не считать погашением.
    - Acceptance: воспроизводимые сценарии для `$1000` Free Reserve, идемпотентные daily snapshots, сверка с ledger, отсутствие balance writes из калькулятора и отчёт о причинах изменения коэффициента.
    - Связанные документы: `docs/AI_COORDINATOR_SYSTEM_GROWTH_PLAN.md`, `docs/CORE_REINVEST_CALCULATOR_PLAN.md`.
10. [ ] **System products + provider demand loop**

    - Добавить consent-aware сбор планируемой цели вывода: категория, примерная сумма, срок и срочность; приватные детали не попадают в общий контекст.
    - Превращать повторяющиеся цели в product/provider challenges: предложение → поставщик → выполнение → подтверждённый `Net Wallet Settlement`.
    - Acceptance: события `withdrawal_intent → matched_offer → fulfilled → settled`, расчёт внешней выплаты поставщику, фактически сохранённый Wallet и ручной review первой когорты.
    - Не входит: блокировка вывода, скрытое удержание средств, выдача Core за raw GMV или массовое подключение поставщиков до измерения качества.
    - Связанные документы: `docs/AI_COORDINATOR_SYSTEM_GROWTH_PLAN.md`, `docs/MARKETPLACE_ESCROW_PLAN.md`.
11. [ ] **Reinvest scenarios + internal-use challenge pilot**

    - Расширить существующий калькулятор сценариями `50% / 75% / 100%` реинвеста на горизонтах 1/3/5/10 лет и показывать личную разницу без изменения баланса.
    - Провести малый opt-in пилот челленджей: внутренняя замена запланированной покупки, создание полезного продукта, повторное использование поставщика и добровольный reinvest plan.
    - Acceptance: proof полезного действия, измерение `reinvest → retention → Net Wallet Settlement`, capacity gate для Core reward; streak «без вывода» не использовать как единственный результат.
    - Связанные документы: `docs/CORE_REINVEST_CALCULATOR_PLAN.md`, `docs/AI_COORDINATOR_SYSTEM_GROWTH_PLAN.md`, `docs/CHALLENGES_CATALOG.md`.
12. [ ] **Internal purchase credit pilot**

    - После закрытия Marketplace safety и наблюдаемости запустить только operator-approved пилот прямой оплаты поставщику: без свободного Wallet, cash-out, покупки Core и каскадного заимствования.
    - Задать лимит от ожидаемого Wallet-потока 60–90 дней, срок, repayment schedule, reserve for credit losses, stop при просрочке и отдельные ledger-события.
    - Acceptance: идемпотентная выдача, offset будущих начислений, полная прослеживаемость долга, default/arrears сценарии, ручной review и kill switch.
    - Не включать в production-масштабирование до подтверждения внутреннего погашения, покрытия и качества поставщиков.
    - Связанные документы: `docs/MUTUAL_CREDIT_MARKET_PLAN.md`, `docs/MARKETPLACE_ESCROW_PLAN.md`, `docs/AI_COORDINATOR_SYSTEM_GROWTH_PLAN.md`.

## Технически реализовано / нужен User QA

### Первый пользовательский маршрут

- [X] **Growth analytics MVP:** добавлены first-touch attribution, `app_open + meaningful action` и operator-only report по activation, D1/D3/D7, рефералам, Wallet deposits и Wallet → Core. Report переиспользует `product_events`, `referral_edges` и `wallet_ledger`; новые финансовые ledger/snapshots, dashboard и подтверждение человечности отложены как избыточные для первой когорты. Проверка — `pnpm test:growth`; остаётся User QA.
- [X] **Offline-first старт:** default navigation возвращен на `Goals → Notes`; Notes остаются local-first и доступны мгновенно без сети, Home сохраняется отдельной вкладкой.
- [ ] Wishes: личные желания CRUD, рекомендации, копирование рекомендации и публичные желания.
- [ ] Пирамида глубины желаний: продуктовая модель и рекомендуемый UX зафиксированы в `docs/WISH_PROGRESS_PYRAMID.md`; следующий шаг — прототип блока `Goals -> Wishes -> Моя пирамида желаний` без миграции данных.
- [ ] Wallet/Core: балансы, история, уровни, ежедневное начисление, reinvest split и Wallet -> Core через atomic ledger RPC.
- [X] **Core redemption safeguard (legacy):** старый obligations/breach/redemption-контур сохранён в истории, но признан несовместимым с базовым принципом строго неснижаемого Core и не должен включаться. Миграция `20260731120000_core_strictly_non_decreasing.sql` добавляет DB-trigger, который отклоняет уменьшение Core; применение к окружениям остаётся отдельным шагом. История: `docs/CORE_REDEMPTION_SAFEGUARD_PLAN.md`.
- [ ] Финансовый калькулятор: future amount, time to goal, daily income и сравнение сценариев.
- [ ] Today technical MVP: сохраненный growth plan, дневная цель, checklist, progress, streak, встроенное состояние Home и карточка в Challenges.
- [ ] Starter Challenges: accept/check/reward, автопроверки и quiz сложного процента.
- [ ] Funnel analytics: onboarding, wish, growth plan, challenge accepted/completed; технически готово, нужен просмотр реальных beta-событий.

### Goals Growth Map MVP

- [ ] Первая версия карты технически реализована в `components/GrowthMapApp.tsx` и подключена как вкладка Goals: показывает текущий уровень, ближайшие пороги Core, маршрут из шести остановок, привязанные желания и состояния loading/offline/error.

- **Оценка:** это полезный слой ориентации в Core, но пока не отдельный action-loop: карта не ведет прямо в Today/следующий challenge и не показывает динамику личного плана.
- **Статус:** нужен User QA; расширение CTA, динамики плана и финансовой истории не добавлять в текущий MVP.

### Возврат и личная организация

- [ ] PWA foundation и общий local-first IndexedDB.
- [ ] Notes offline pilot и синхронизация заметок.
- [ ] Tasks/Streaks: задачи, расписание, subtasks, repeat, archive, soft mode и lives.
- [ ] Results/brochure и локальный результат после первого прочтения.

### Социальный и командный фундамент

- [ ] Feed/blog: публичная лента, личный блог, ручные посты, daily growth drafts, публичные желания и внешние ссылки.
- [ ] People/public profiles: поиск людей, `/u/[userId]`, публичный блог, контакты и простой Direct.
- [ ] Referrals/teams: referral claim, team membership, capacity, контакты команды и team bonus ledger.
- [ ] Trust-lite: mutual confirmations, trust events, reciprocity summary и challenge checks.
- [ ] AI Coordinator: единый AI Gateway, capability registry, consent-aware Context Broker и подтверждаемая память пользователя; чат доступен как вторичная вкладка Home и пока не получает user context. Архитектура и этапы: `docs/AI_CONTEXT_MEMORY_ARCHITECTURE.md`.
- [X] AI chat stage 1 технически реализован: локальная история Home → Ideas, 20 встроенных вопросов, Nova/quick actions и локальный UX-лимит 20 сообщений в UTC-сутки / 300 в UTC-месяц; требуется отдельный User QA.
- [X] AI chat stage 2 технически реализован: `/api/ai/chat` использует существующий Supabase access token, атомарную серверную quota `20/day` и `300/month`, metadata-only `ai_usage_events`, per-user rate/concurrency control и provider health/cooldown для Gemini → Groq fallback. Migration `20260731150000_ai_usage_quota_and_provider_health.sql` применена к удалённому Supabase.
- [X] AI chat stage 3 BYOK технически реализован: режимы `System quota` / `My OpenRouter`, encrypted manual OpenRouter key, server-side settings/key routes, consent fact, curated model allowlist и no-fallback policy. Migration `20260801100000_ai_openrouter_byok.sql` применена к удалённому Supabase.
- [X] Reflection Inbox + Today rhythm: быстрый local-first захват в Notes с `reviewAt = +24h`, агрегированный локальный пункт `Разобрать заметки · N` на Home, guided AI-разбор из четырёх выборов с собственным вариантом и максимум двумя адаптивными уточнениями, редактируемое я-высказывание, возможные причины, ресурсы, if-then действие, связь с Checks, единый Today reminder и completion-streak челленджи 7/30. Push требует применения миграций и настройки VAPID/Vault; детали в `docs/REFLECTION_PROCESSING_PLAN.md` и `docs/TODAY_DAILY_CHALLENGE_PLAN.md`.

### Поздние контуры, уже имеющие технический фундамент

- [ ] Open Projects: каталог, заявки и project tasks без завершенного participation loop.
- [X] Marketplace foundation: artifacts, wallet ledger, Wallet-to-Wallet, listings и deal lifecycle с atomic completion подготовлены. Remote schema и internal escrow migration доступны; buyer/seller User QA ещё впереди.
- [X] Native TON deposit MVP: invoice, chain ingestion/finality и idempotent Wallet credit реализованы первой версией. Полный статус и границы — `docs/TON_DEPOSIT_MVP_PLAN.md`; ограниченный withdrawal подтверждён ручным mainnet User QA, полный статус и границы — `docs/WALLET_CRYPTO_RAILS_PLAN.md`.

## Подтверждено пользователями

- [X] **Ограниченный native TON withdrawal:** пользователь подтвердил 2026-08-02, что ручной mainnet success-сценарий работает. Feature flag, авторизация, server-side signer, Wallet reserve, комиссии и отправка TON доступны без allowlist; расширенные failure-сценарии, reconciliation/confirmed worker и production custody остаются отдельным hardening-этапом до массового вывода.
- [X] **Home/Today как отдельный главный экран:** пользователь подтвердил 2026-07-15, что Home работает; Home и AI chat объединены в одной навигационной группе, количество главных вкладок сокращено с шести до пяти, CTA/Today/план и переходы работают в ручном сценарии. Стартовый маршрут при этом остается `Goals → Notes`.
- [X] **MVP receipt после Core reward:** пользователь подтвердил receipt после начисления; receipt показывает challenge, verification, сумму и Core после начисления. Ledger ID, финансовая история и server-side изменение личного плана отложены до финансового этапа.
- [X] **Единый onboarding:** 2026-07-22 три экрана `миссия -> истории -> программа 20 уровней` завершаются обязательным Google-входом без guest shell. Первая регистрация автоматически создаёт профиль/Core/Wallet, начисляет стартовый бонус `+2$ Core`, показывает одноразовый receipt и открывает ленту. Старый signup-челлендж скрыт из каталога; визуальный эталон закреплен в `docs/VISUAL_LANGUAGE.md`.
- [X] Offline Notes Pilot: создание, изменение и удаление заметок offline, восстановление и синхронизация после возвращения сети были вручную приняты.
- [X] Документационная фиксация: Markdown-канбан принят как канонический трекер; мастер-план отделен от накопительного project memory.
- [X] Первая цепочка Core-челленджей: пользователь подтвердил 2026-07-13, что текущую карточку переносим в подтвержденные; цепочка остается без жестких prerequisite-блокировок, completed не возвращаются в доступные, accepted раскрывается списком, `Give up` возвращает accepted-челлендж в доступные, `Turn On Core Growth` заменен на Today Core target.
- [X] **Verified Reality Feed:** пользователь подтвердил 2026-08-02 draft-first сценарий Core challenge → Открыть черновик → Blog → Drafts → опубликовать → People → Feed → обновить; verified/demo/system badges убраны с плиток-обложек и остаются только внутри detail.
- [X] **Skill Passport + automatic skill levels:** пользователь подтвердил 2026-08-02 ручной сценарий refresh после referral/public post/team fact; текущий automatic-checks-first срез закрыт.
- [X] **USDT Jetton в TON:** основатель подтвердил 2026-08-06, что User QA пройден; дальнейшие аудиты TON mainnet и blockchain hardening остаются отдельным отложенным этапом.

## Заблокировано

- Массовый внешний вывод Wallet остаётся заблокирован до полной сверки chain/ledger, разделения основного резерва и operating hot wallet, безопасной custody, failure/reconciliation-процедур и операционной поддержки. Успешный малый mainnet withdrawal loop подтверждён 2026-08-02.
- Публичные обещания фиксированного или гарантированного дохода заблокированы до доказуемого покрытия обязательств и юридической проверки формулировок.
- Пользовательский текст о redemption Core запрещён: Core строго неснижаем. Старый feature flag, Core-redemption liability, KYC/AML, cooling period и worker не являются основанием для его включения.
- Масштабирование за пределы закрытой когорты заблокировано до появления аналитики, положительного D1/D3/D7 и сверки Wallet-обязательств с фондом.

## Отложено

- Advanced Marketplace: полный арбитраж, аукционы, частичные платежи и сложный uncapped discovery.
- Расширенный project participation loop и большой каталог проектов.
- Advanced social: несколько реакций, saves, глубокие comment threads, full follows graph и автоматический cross-posting APIs.
- Advanced Skills: полный каталог высоких уровней, сертификаты, поручительство и сложный рынок review-slots.
- Global Trust leaderboard и автоматические ограничения базового доступа по Trust; публичный calibrated Trust v2 остаётся плановым этапом очереди.
- Afterburn.
- Полноценный Direct: список диалогов, read receipts, mute/report и расширенные настройки приватности.
- Полный marketplace пользовательских заданий и marketplace-челленджи.
- Банковский onramp/off-ramp, P2P, bridge, swap и несколько одновременно запускаемых blockchain-сетей.
- Нативные приложения, счета, инвойсы, smart contracts и приватный блокчейн.
- Video/interactive Future Sim и Vision/Sims full economy до проверки статичного сценария.
- AI autonomous/high-risk actions.
- Платная реклама и публичный неуправляемый трафик до quality gates.

## Критерии закрытого пилота

- Когорта: 20-50 лично приглашенных русскоязычных пользователей.
- Не менее 70% создают главное желание и сохраняют финансовый план.
- Не менее 50% получают первый проверяемый результат или понимают срок и способ его проверки.
- Ориентиры удержания: D1 >= 40%, D3 >= 25%, D7 >= 15%.
- Не менее 30% активированных участников публикуют карточку результата.
- Не менее 20% активированных участников отправляют приглашение.
- Каждое Wallet-начисление имеет источник, ledger-запись, защиту от повторного начисления и покрытие фондом.
- Демо-контент всегда визуально и семантически отделен от реальных результатов.
