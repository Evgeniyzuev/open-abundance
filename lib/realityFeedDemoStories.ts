export type RealityStoryText = {
  ru: string;
  en: string;
};

export type RealityDemoStory = {
  id: string;
  category: RealityStoryText;
  title: RealityStoryText;
  summary: RealityStoryText;
  milestones: RealityStoryText[];
  outcome: RealityStoryText;
};

/**
 * These are explicitly fictional inspiration scenarios. They are not user
 * testimonials, verified results, financial projections, or promises.
 */
export const REALITY_FEED_DEMO_STORIES: readonly RealityDemoStory[] = [
  {
    id: "from-burnout-to-freelance",
    category: { ru: "Свободный график", en: "Flexible work" },
    title: { ru: "Из выгорания — в работу по своему ритму", en: "From burnout to a rhythm of her own" },
    summary: { ru: "Ирина перестала строить жизнь вокруг нелюбимой работы и начала с одного небольшого freelance-заказа.", en: "Irina stopped building life around a job she disliked and started with one small freelance project." },
    milestones: [
      { ru: "собрала портфолио из прошлых навыков", en: "built a portfolio from skills she already had" },
      { ru: "перевела часть задач в удаленный формат", en: "moved part of her work to a remote format" },
      { ru: "оставила место для отдыха и личных целей", en: "made room for rest and personal goals" }
    ],
    outcome: { ru: "Работает блоками, а свободное время использует для давней мечты — путешествий.", en: "She works in focused blocks and uses the space for a long-held dream: traveling." }
  },
  {
    id: "small-town-remote-career",
    category: { ru: "Удаленная карьера", en: "Remote career" },
    title: { ru: "Карьера без переезда в большой город", en: "A career without moving to a big city" },
    summary: { ru: "Максим живет в небольшом городе и постепенно собрал удаленную специализацию вместо гонки за офисом.", en: "Max lives in a small town and gradually built a remote specialty instead of chasing an office job." },
    milestones: [
      { ru: "выбрал одну востребованную задачу", en: "chose one useful, in-demand task" },
      { ru: "учился на реальных маленьких проектах", en: "learned through small real projects" },
      { ru: "сформировал спокойный рабочий день", en: "shaped a calmer workday" }
    ],
    outcome: { ru: "Остается рядом с близкими и выбирает место жизни сам.", en: "He stays close to family and chooses where to live for himself." }
  },
  {
    id: "designer-second-career",
    category: { ru: "Новая профессия", en: "Career change" },
    title: { ru: "Вторая профессия из старого опыта", en: "A second career built from old experience" },
    summary: { ru: "Лена перенесла опыт координатора в UX-дизайн и перестала считать прошлую карьеру потерянным временем.", en: "Lena carried her coordinator experience into UX design and stopped seeing her past career as wasted time." },
    milestones: [
      { ru: "нашла повторяющиеся сильные стороны", en: "identified her recurring strengths" },
      { ru: "сделала три учебных кейса", en: "created three practice cases" },
      { ru: "начала брать задачи по новой специализации", en: "started taking projects in the new specialty" }
    ],
    outcome: { ru: "Работа стала ближе к интересам, а опыт начал работать на нее.", en: "Her work moved closer to her interests, and her experience began working for her." }
  },
  {
    id: "parent-flexible-income",
    category: { ru: "Семья и работа", en: "Family and work" },
    title: { ru: "Доход, который помещается в семейный день", en: "Income that fits a family day" },
    summary: { ru: "Ольга выстроила несколько коротких рабочих окон, чтобы не выбирать между заботой о семье и развитием.", en: "Olga built several short work windows so she did not have to choose between family care and growth." },
    milestones: [
      { ru: "оставила только самые сильные услуги", en: "kept only her strongest services" },
      { ru: "заранее договорилась о границах времени", en: "agreed on clear time boundaries" },
      { ru: "часть дохода направила в Core", en: "directed part of her income to Core" }
    ],
    outcome: { ru: "Ее рабочий день стал гибким, а цели — видимыми и измеримыми.", en: "Her workday became flexible, while her goals became visible and measurable." }
  },
  {
    id: "teacher-independent-practice",
    category: { ru: "Своя практика", en: "Independent practice" },
    title: { ru: "От расписания школы — к своим ученикам", en: "From a school schedule to her own students" },
    summary: { ru: "Аня превратила опыт преподавания в небольшую самостоятельную практику.", en: "Anya turned her teaching experience into a small independent practice." },
    milestones: [
      { ru: "собрала понятную программу", en: "packaged a clear program" },
      { ru: "начала с нескольких постоянных учеников", en: "started with a few regular students" },
      { ru: "добавила групповые занятия онлайн", en: "added online group sessions" }
    ],
    outcome: { ru: "Она сама определяет нагрузку и постепенно освобождает время для учебы.", en: "She sets her own workload and gradually frees time for learning." }
  },
  {
    id: "maker-to-small-brand",
    category: { ru: "Творческий бизнес", en: "Creative business" },
    title: { ru: "Хобби, которое стало маленьким брендом", en: "A hobby that became a small brand" },
    summary: { ru: "Саша начал с вещей для друзей, а затем превратил любимое ремесло в аккуратную систему заказов.", en: "Sasha started by making things for friends and turned a favorite craft into a simple order system." },
    milestones: [
      { ru: "выбрал одну узнаваемую линейку", en: "chose one recognizable line" },
      { ru: "показал процесс, а не только результат", en: "shared the process, not only the result" },
      { ru: "научился планировать загрузку", en: "learned to plan capacity" }
    ],
    outcome: { ru: "Работа приносит удовольствие и дает ресурс на давно отложенную поездку.", en: "The work brings joy and funds a long-postponed trip." }
  },
  {
    id: "developer-location-freedom",
    category: { ru: "Работа откуда угодно", en: "Work from anywhere" },
    title: { ru: "Ноутбук вместо привязки к одному месту", en: "A laptop instead of being tied to one place" },
    summary: { ru: "Денис сделал удаленный формат не отпуском, а устойчивой частью своей работы.", en: "Denis made remote work a sustainable part of his life rather than a temporary vacation." },
    milestones: [
      { ru: "зафиксировал результат, а не часы в офисе", en: "focused on outcomes instead of office hours" },
      { ru: "выстроил асинхронную коммуникацию", en: "built an async communication habit" },
      { ru: "создал резерв времени между проектами", en: "created time buffer between projects" }
    ],
    outcome: { ru: "Может менять место жизни, не обнуляя рабочий ритм.", en: "He can change where he lives without resetting his work rhythm." }
  },
  {
    id: "local-service-online",
    category: { ru: "Локальный сервис", en: "Local service" },
    title: { ru: "Сервис рядом с домом и онлайн-система", en: "A neighborhood service with an online system" },
    summary: { ru: "Мария перестала зависеть от случайных заказов и собрала понятный поток клиентов для своего сервиса.", en: "Maria stopped depending on random requests and built a clear client flow for her service." },
    milestones: [
      { ru: "описала лучший результат для клиента", en: "defined the best client outcome" },
      { ru: "ввела предварительную запись", en: "introduced advance booking" },
      { ru: "освободила один день в неделю", en: "freed one day each week" }
    ],
    outcome: { ru: "Доход стал предсказуемее, а жизнь — не только продолжением работы.", en: "Income became more predictable, and life became more than an extension of work." }
  },
  {
    id: "language-tutor-worldwide",
    category: { ru: "Навык в продукт", en: "Skill to product" },
    title: { ru: "Язык как мост к международной работе", en: "A language skill as a bridge to global work" },
    summary: { ru: "Роман начал с индивидуальных уроков, а затем упаковал методику в самостоятельный продукт.", en: "Roman started with one-to-one lessons and later packaged his method into a product." },
    milestones: [
      { ru: "собрал повторяемый план занятий", en: "built a repeatable lesson plan" },
      { ru: "сохранил лучшие объяснения в библиотеку", en: "saved his best explanations in a library" },
      { ru: "добавил формат для разных часовых поясов", en: "added a format for different time zones" }
    ],
    outcome: { ru: "Его работа перестала зависеть от одного города и одного формата.", en: "His work no longer depended on one city or one format." }
  },
  {
    id: "careful-career-exit",
    category: { ru: "Переход без рывка", en: "A measured transition" },
    title: { ru: "Уход с нелюбимой работы по плану", en: "Leaving a disliked job with a plan" },
    summary: { ru: "Павел не увольнялся одним днем: он сначала создал запас, протестировал новый формат и только потом сделал переход.", en: "Pavel did not quit overnight: he built a buffer, tested a new format, and then made the transition." },
    milestones: [
      { ru: "посчитал минимальную безопасную сумму", en: "calculated a safe minimum" },
      { ru: "проверил новый навык на маленьком объеме", en: "tested a new skill at a small scale" },
      { ru: "назначил дату пересмотра плана", en: "set a date to review the plan" }
    ],
    outcome: { ru: "Решение стало осознанным выбором, а не побегом от усталости.", en: "The decision became a deliberate choice rather than an escape from exhaustion." }
  },
  {
    id: "photographer-slow-growth",
    category: { ru: "Творческий путь", en: "Creative path" },
    title: { ru: "Фотография, которая вернула ощущение пути", en: "Photography that restored a sense of direction" },
    summary: { ru: "Ника превратила редкие съемки в последовательный проект и стала выбирать заказы по смыслу.", en: "Nika turned occasional shoots into a consistent project and began choosing meaningful assignments." },
    milestones: [
      { ru: "собрала серию работ в один рассказ", en: "shaped her work into one story" },
      { ru: "научилась отказываться от неподходящих заказов", en: "learned to decline poor-fit work" },
      { ru: "оставила время для личного проекта", en: "reserved time for a personal project" }
    ],
    outcome: { ru: "Рост пришел не через постоянную занятость, а через более точный выбор.", en: "Growth came not from constant busyness, but from better choices." }
  },
  {
    id: "operations-to-consulting",
    category: { ru: "Опыт как капитал", en: "Experience as capital" },
    title: { ru: "Опыт операционного менеджера стал консультацией", en: "Operations experience became consulting" },
    summary: { ru: "Виктор понял, что его сильная сторона — не должность, а умение наводить порядок в сложных процессах.", en: "Victor realized his strength was not a job title, but the ability to bring order to complex processes." },
    milestones: [
      { ru: "описал повторяющиеся задачи как метод", en: "turned recurring tasks into a method" },
      { ru: "провел первые разборы для знакомых команд", en: "ran the first reviews for familiar teams" },
      { ru: "перешел от часов к измеримому результату", en: "shifted from hours to measurable outcomes" }
    ],
    outcome: { ru: "Он продает ясность и опыт, а не просто свое присутствие в офисе.", en: "He sells clarity and experience, not simply his presence in an office." }
  },
  {
    id: "community-to-platform",
    category: { ru: "Сообщество", en: "Community" },
    title: { ru: "Из полезного чата — в устойчивое сообщество", en: "From a useful chat to a sustainable community" },
    summary: { ru: "Алина собирала людей вокруг общей задачи и постепенно создала формат, который приносит пользу без постоянного выгорания.", en: "Alina gathered people around a shared problem and built a useful format without constant burnout." },
    milestones: [
      { ru: "сформулировала одну общую тему", en: "defined one shared theme" },
      { ru: "ввела регулярные встречи и правила", en: "introduced regular sessions and rules" },
      { ru: "делегировала часть организационной работы", en: "delegated part of the coordination" }
    ],
    outcome: { ru: "Ее окружение стало источником поддержки, идей и новых возможностей.", en: "Her community became a source of support, ideas, and new opportunities." }
  },
  {
    id: "researcher-independent-work",
    category: { ru: "Осмысленная работа", en: "Meaningful work" },
    title: { ru: "Исследовательская работа без постоянной спешки", en: "Research work without constant rush" },
    summary: { ru: "Тимур ушел от бесконечных срочных задач и собрал независимый формат аналитической работы.", en: "Timur left endless urgent tasks and built an independent analytical practice." },
    milestones: [
      { ru: "выбрал узкую тему, в которой силен", en: "chose a narrow field he knew well" },
      { ru: "создал публичную базу полезных наблюдений", en: "created a public library of useful observations" },
      { ru: "перевел часть работы в долгие циклы", en: "moved part of the work into longer cycles" }
    ],
    outcome: { ru: "У него появилось пространство думать, создавать и выбирать клиентов.", en: "He gained room to think, create, and choose clients." }
  },
  {
    id: "craftsman-digital-orders",
    category: { ru: "Ремесло и система", en: "Craft and systems" },
    title: { ru: "Ремесло без жизни от заказа до заказа", en: "Craft without living order to order" },
    summary: { ru: "Егор сохранил ручную работу, но добавил каталог, очередь и понятные правила приема заказов.", en: "Egor kept his handmade work and added a catalog, queue, and clear order rules." },
    milestones: [
      { ru: "убрал самые непредсказуемые позиции", en: "removed the least predictable items" },
      { ru: "научился считать время изготовления", en: "learned to estimate making time" },
      { ru: "оставил выходные без рабочих сообщений", en: "kept weekends free from work messages" }
    ],
    outcome: { ru: "Доход поддерживает ремесло, а ремесло не забирает всю жизнь.", en: "Income supports the craft without letting the craft take over life." }
  },
  {
    id: "career-break-return",
    category: { ru: "Новый старт", en: "A new start" },
    title: { ru: "Возвращение в профессию после паузы", en: "Returning to a profession after a pause" },
    summary: { ru: "Светлана использовала жизненную паузу, чтобы обновить навыки и вернуться на своих условиях.", en: "Svetlana used a life pause to refresh her skills and return on her own terms." },
    milestones: [
      { ru: "собрала честную карту навыков", en: "made an honest skills map" },
      { ru: "начала с коротких проектов", en: "started with short projects" },
      { ru: "выбрала график, совместимый с новой жизнью", en: "chose a schedule compatible with her new life" }
    ],
    outcome: { ru: "Пауза перестала быть пробелом и стала частью ее новой истории.", en: "The pause stopped being a gap and became part of her new story." }
  },
  {
    id: "two-income-paths",
    category: { ru: "Несколько опор", en: "Multiple supports" },
    title: { ru: "Две рабочие опоры вместо одной", en: "Two work supports instead of one" },
    summary: { ru: "Кирилл не искал одну идеальную профессию: он собрал основной навык и небольшой дополнительный продукт.", en: "Kirill did not search for one perfect career: he combined a core skill with a small additional product." },
    milestones: [
      { ru: "разделил стабильную и экспериментальную часть", en: "separated stable and experimental work" },
      { ru: "проверял идеи маленькими шагами", en: "tested ideas in small steps" },
      { ru: "направлял рост в резерв и Core", en: "directed growth into a buffer and Core" }
    ],
    outcome: { ru: "Он получил больше свободы менять направление без резкого риска.", en: "He gained more freedom to change direction without a sudden leap." }
  },
  {
    id: "wellbeing-business",
    category: { ru: "Забота о себе", en: "Wellbeing" },
    title: { ru: "Работа, в которой есть место здоровью", en: "Work with room for wellbeing" },
    summary: { ru: "Катя перестала измерять успех количеством занятых часов и перестроила услуги вокруг устойчивого темпа.", en: "Katya stopped measuring success by busy hours and redesigned her services around a sustainable pace." },
    milestones: [
      { ru: "выделила задачи, которые дают энергию", en: "identified energizing tasks" },
      { ru: "сократила лишние созвоны", en: "cut unnecessary calls" },
      { ru: "встроила отдых в план, а не в остаток дня", en: "planned rest instead of leaving it for leftover time" }
    ],
    outcome: { ru: "Доход растет вместе с качеством жизни, а не вместо него.", en: "Income grows alongside quality of life, not instead of it." }
  },
  {
    id: "traveling-consultant",
    category: { ru: "Мобильная жизнь", en: "A mobile life" },
    title: { ru: "Работа из разных городов без потери опоры", en: "Working from different cities without losing stability" },
    summary: { ru: "Мила превратила поездки из редкого отпуска в осознанный ритм жизни, не обещая себе вечной продуктивности.", en: "Mila turned travel from a rare vacation into a deliberate rhythm without demanding constant productivity from herself." },
    milestones: [
      { ru: "оставила только удаленные процессы", en: "kept only remote processes" },
      { ru: "заранее планировала тихие рабочие дни", en: "planned quiet workdays in advance" },
      { ru: "отделила путешествие от бесконечной гонки", en: "separated travel from endless rushing" }
    ],
    outcome: { ru: "Она выбирает следующий город как часть своей жизни, а не как побег.", en: "She chooses the next city as part of life, not as an escape." }
  },
  {
    id: "first-product-launch",
    category: { ru: "Свой продукт", en: "Own product" },
    title: { ru: "Первый продукт вместо бесконечных консультаций", en: "A first product instead of endless consulting" },
    summary: { ru: "Артем собрал повторяющийся опыт в небольшой продукт, который можно улучшать, а не каждый раз начинать заново.", en: "Artem turned repeated experience into a small product he could improve instead of rebuilding from zero." },
    milestones: [
      { ru: "выбрал одну понятную проблему", en: "chose one clear problem" },
      { ru: "проверил решение на первых пользователях", en: "tested the solution with early users" },
      { ru: "оставил живую обратную связь внутри продукта", en: "kept live feedback inside the product" }
    ],
    outcome: { ru: "У него появилось больше времени на развитие и меньше повторяющейся рутины.", en: "He gained more time for growth and less repetitive routine." }
  },
  {
    id: "family-business-modernized",
    category: { ru: "Семейное дело", en: "Family business" },
    title: { ru: "Семейное дело, которое стало современнее", en: "A family business made more modern" },
    summary: { ru: "Вера не бросила дело родителей, а помогла ему перейти от хаотичных заказов к понятному онлайн-формату.", en: "Vera did not leave her family business; she helped it move from chaotic orders to a clear online format." },
    milestones: [
      { ru: "описала процессы и роли", en: "mapped processes and roles" },
      { ru: "добавила цифровой каталог", en: "added a digital catalog" },
      { ru: "ввела день без операционных задач", en: "introduced a day without operations" }
    ],
    outcome: { ru: "Семейный доход стал устойчивее, а у нее появилось свое направление.", en: "Family income became steadier, and she gained a direction of her own." }
  },
  {
    id: "late-blooming-creator",
    category: { ru: "Поздний старт", en: "A late start" },
    title: { ru: "Начать творческий путь не в двадцать", en: "Starting a creative path later in life" },
    summary: { ru: "Юрий перестал ждать идеального момента и начал публиковать маленькие работы рядом с основной занятостью.", en: "Yuri stopped waiting for a perfect moment and began publishing small works beside his main job." },
    milestones: [
      { ru: "выбрал регулярность вместо масштаба", en: "chose consistency over scale" },
      { ru: "собрал первые отклики в портфолио", en: "turned early feedback into a portfolio" },
      { ru: "постепенно сократил нелюбимые задачи", en: "gradually reduced disliked tasks" }
    ],
    outcome: { ru: "Мечта стала практикой, которую можно развивать в своем темпе.", en: "The dream became a practice he could grow at his own pace." }
  },
  {
    id: "dream-home-project",
    category: { ru: "Давнее желание", en: "A long-held wish" },
    title: { ru: "Давнее желание получило отдельный маршрут", en: "A long-held wish got its own route" },
    summary: { ru: "Наташа перестала держать большую цель только в голове и связала ее с маленькими действиями и личным планом.", en: "Natasha stopped keeping a big goal only in her head and connected it to small actions and a personal plan." },
    milestones: [
      { ru: "сформулировала конкретный результат", en: "defined a concrete result" },
      { ru: "разбила путь на уровни и шаги", en: "split the path into levels and steps" },
      { ru: "отмечала прогресс каждую неделю", en: "reviewed progress each week" }
    ],
    outcome: { ru: "Мечта стала не далекой фантазией, а направлением сегодняшней жизни.", en: "The dream became a direction for today's life rather than a distant fantasy." }
  }
];
