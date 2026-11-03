import Link from "next/link";
import AlinaChat from "@/components/AlinaChat";
import { loadAlinaStories } from "@/lib/alinaStoriesServer";
import { MENTORS, type MentorKey } from "@/lib/mentors";

/** A mentor's public profile (lib/mentors.ts, docs/mentors/): who they are, their invitation and chat, their stories. */
export default async function MentorProfile({ mentorKey }: { mentorKey: MentorKey }) {
  const mentor = MENTORS[mentorKey];
  const stories = await loadAlinaStories(mentor.systemAccountKey);
  const cta = `/?utm_source=${mentor.key}&utm_medium=profile`;
  return (
    <main className="legal-page alina-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <Link className="legal-home-link" href={cta}>Open Abundance</Link>
        </header>

        <section className="alina-hero">
          <img alt={mentor.name.ru} src={mentor.coverUrl} />
          <div>
            <h1>{mentor.name.ru}</h1>
            <p>{mentor.hero}</p>
          </div>
        </section>

        <section className="alina-invite">
          <h2>{mentor.invite.title.ru}</h2>
          <p>{mentor.invite.text.ru}</p>
          <AlinaChat locale="ru" mentorKey={mentor.key} />
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

        <p className="alina-note">{mentor.note}</p>
      </article>
    </main>
  );
}
