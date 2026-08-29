import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Experiment",
  description: "What the Open Abundance experiment is testing right now."
};

export default function ExperimentPage() {
  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <Link href="/" className="legal-home-link">← Open the app</Link>
        </header>
        <div className="legal-document-title">
          <h1>What we are testing now</h1>
          <p>
            Open Abundance is a live experiment. This page describes the
            current stage — what we are checking, with whom, and what counts
            as a result.
          </p>
        </div>
        <div className="legal-sections">
          <section>
            <h2>Current stage</h2>
            <p>
              We are testing whether a small group of first participants can
              turn personal wishes into completed real actions using daily
              challenges, missions and mutual help — and whether the app keeps
              them moving without pressure.
            </p>
          </section>
          <section>
            <h2>What counts as a result</h2>
            <ul>
              <li>A declared wish becomes a completed, visible result.</li>
              <li>Daily challenges are completed consistently, not in bursts.</li>
              <li>Participants help each other fulfill wishes.</li>
              <li>The loop — wish → action → result → next wish — repeats.</li>
            </ul>
          </section>
          <section>
            <h2>Join the experiment</h2>
            <p>
              The app is open to everyone. Start by declaring one real wish —
              the app will turn it into your first mission.
            </p>
          </section>
        </div>
        <footer className="legal-document-footer">
          <Link href="/" className="legal-primary-action">Open the app</Link>
          <nav>
            <Link href="/about">About Open Abundance</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}