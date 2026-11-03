import type { Metadata } from "next";
import Link from "next/link";
import AlinaChat from "@/components/AlinaChat";
import { loadAlinaStories } from "@/lib/alinaStoriesServer";
import { OA_LEAD_PERSONA } from "@/lib/oaLeadPersona";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Алина Агитова · ИИ-наставница Open Abundance",
  description: "Истории о боли и освобождении и личный разбор твоей ситуации: что держит, чего хочется на самом деле и первый лёгкий шаг.",
  alternates: { canonical: "/alina" },
  openGraph: { images: [OA_LEAD_PERSONA.avatarUrl.replace("avatar", "cover")] }
};

const CTA = "/?utm_source=alina&utm_medium=profile";

/** Alina's public profile (docs/mentors/ALINA_AGITOVA.md): who she is, her invitation and chat, her stories. */
export default async function AlinaPage() {
  const stories = await loadAlinaStories();
  return (
    <main className="legal-page alina-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <Link className="legal-home-link" href={CTA}>Open Abundance</Link>
        </header>

        <section className="alina-hero">
          <img alt="Алина Агитова" src={OA_LEAD_PERSONA.avatarUrl.replace("avatar", "cover")} />
          <div>
            <h1>Алина Агитова</h1>
            <p>Я знаю, каково это, когда тебя не замечают, недооценивают или обманывают. И знаю, как оттуда выходят на свободу. Пишу об этом истории и помогаю найти свой путь.</p>
          </div>
        </section>

        <section className="alina-invite">
          <h2>Разберу лично твою ситуацию</h2>
          <p>Расскажи, где ты сейчас и чего тебе по-настоящему хочется. Я задам пару вопросов, без оценок и спешки. Вместе найдём, что тебя держит, и первый лёгкий шаг, который можно сделать уже сегодня.</p>
          <AlinaChat locale="ru" />
        </section>

        {stories.length ? (
          <section className="alina-stories">
            <h2>Мои истории</h2>
            <div className="alina-story-grid">
              {stories.map((story) => (
                <Link key={story.id} className="alina-story-card" href={`/d/${story.id}`}>
                  {story.cover ? <img alt="" src={story.cover} /> : null}
                  <strong>{story.title ?? "История"}</strong>
                  <span>{story.excerpt}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <p className="alina-note">Алина — ИИ-наставница Open Abundance. Её истории — литература, собранная из многих настоящих судеб.</p>
      </article>
    </main>
  );
}
