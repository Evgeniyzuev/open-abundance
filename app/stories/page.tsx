import type { Metadata } from "next";
import Link from "next/link";
import { loadGrowthStories } from "@/lib/growthStoriesServer";
import { STORY_WINDOW_DAYS, type GrowthStory } from "@/lib/growthStories";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Growth stories: verified progress of members",
  description: "Members of Open Abundance show their last 30 days: level, turnover and challenges counted by the system, and the wishes they fulfilled.",
  alternates: { canonical: "/stories" }
};

const CTA = "/?utm_source=stories&utm_medium=public_stories";

export default async function GrowthStoriesPage() {
  const stories = await loadGrowthStories();
  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <Link className="legal-home-link" href={CTA}>Open Abundance</Link>
        </header>

        <div className="legal-document-title">
          <h1>Истории роста · Growth stories</h1>
          <p>Участники показывают свои последние {STORY_WINDOW_DAYS} дней: что сделали и как двигаются к своим желаниям. Members show their last {STORY_WINDOW_DAYS} days.</p>
        </div>

        <section className="legal-sections">
          <section>
            <h2>Что здесь подтверждено · What is verified</h2>
            <p>Уровень, оборот, рост Core и выполненные челленджи система считает сама по журналам Core и Wallet и публикует в ежедневном посте автора. Автор не может их вписать вручную, только скрыть. Отметку «человек подтверждён» ставит проверка «Я не робот». Исполненное желание и рассказ «что изменилось» пишет сам автор.</p>
            <p>Level, turnover, Core growth and challenges are counted by the system from the Core and Wallet ledgers. The author can hide them but cannot type them. Fulfilled wishes are marked by the author.</p>
          </section>
          <section>
            <h2>Авторам и каналам · For creators and channels</h2>
            <p>Здесь темы для роликов и постов: реальный путь человека с цифрами, которые можно проверить по ссылке. Перед тем как рассказывать чужую историю, спросите автора в приложении.</p>
          </section>
        </section>

        <div className="legal-sections">
          {stories.length ? stories.map((story) => <StoryCard key={story.userId} story={story} />)
            : <p>Пока нет историй за последние {STORY_WINDOW_DAYS} дней. No stories yet.</p>}
        </div>

        <Link className="legal-primary-action" href={CTA}>Начать свою историю · Start free</Link>
      </article>
    </main>
  );
}

function StoryCard({ story }: { story: GrowthStory }) {
  const name = story.name ?? (story.username ? `@${story.username}` : "Участник");
  const href = story.username ? `/@${story.username}` : `/u/${story.userId}`;
  const level = story.levelStart !== null && story.levelNow !== null && story.levelStart !== story.levelNow
    ? `уровень ${story.levelStart} → ${story.levelNow}`
    : `уровень ${story.levelNow ?? 0}`;
  const facts = [
    level,
    `${story.activeDays} дн. в реалити`,
    story.hasTurnover ? `оборот ${money(story.turnover)}` : null,
    story.coreGrowth > 0 ? `Core +${money(story.coreGrowth)}` : null,
    story.challenges ? `челленджей: ${story.challenges}` : null,
    story.wishesCount ? `исполнено желаний: ${story.wishesCount}` : null
  ].filter(Boolean);
  return (
    <section>
      <h2><Link href={href}>{name}</Link>{story.humanityVerified ? " · ✓ человек подтверждён" : ""}</h2>
      <p>{facts.join(" · ")}</p>
      {story.wishes.length ? <p>Исполнено: {story.wishes.slice(0, 3).join("; ")}</p> : null}
      {story.changes.map((change, index) => <blockquote key={index}>«{change}»</blockquote>)}
      <p><Link href={href}>Смотреть реалити по дням · Watch day by day</Link></p>
    </section>
  );
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}
