"use client";

import { useEffect, useState } from "react";

// Keep the public description in the first server-rendered HTML response, then
// remove it once the real application has hydrated.
export default function PublicIntro() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    setAppReady(true);
  }, []);

  if (appReady) return null;

  return (
    <section className="public-intro" aria-labelledby="public-intro-title">
      <h1 id="public-intro-title">Open Abundance</h1>
      <p>
        <strong>We&apos;re running an experiment: building AI as an open marketplace of possibilities.</strong>
      </p>
      <p>
        People share their real desires and problems. Instead of simply giving
        advice, AI finds how people have already solved similar problems and
        connects the right knowledge, resources, people and opportunities.
      </p>
      <p>
        Then AI takes on more real-world action to help make those outcomes
        happen.
      </p>
      <p><strong>Less advice. More things actually happening.</strong></p>
    </section>
  );
}
