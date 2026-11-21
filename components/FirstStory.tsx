"use client";

import { useMemo, useState } from "react";
import {
  STORY_LOOKS,
  STORY_SCENES,
  STORY_STORAGE,
  nextSceneKey,
  questMotiveFor,
  resolveStory,
  storySceneCount,
  storyTags,
  storyText,
  storyUi,
  type StoryState
} from "@/lib/firstStory";
import { storeGuestQuest } from "@/lib/guestQuest";
import { trackProductEvent } from "@/lib/productAnalytics";
import { playUiSound } from "@/lib/ui/sound";

type Phase = "look" | "scene" | "wish" | "almost" | "other" | "world";

/**
 * The story entry «Один свободный день» (docs/FIRST_STORY_SCRIPT.md), played by a guest before sign-in in place of the
 * first-step question. The answers are saved like the old guest quest (motive + wish, lib/guestQuest.ts), so the
 * rewards and the sign-in flow stay the same; the story tags are kept on this device for the agent profile.
 */
export function FirstStory({ locale, onDone, onSkip }: { locale: string; onDone: () => void; onSkip: () => void }) {
  const [state, setState] = useState<StoryState>({ answers: [] });
  const [phase, setPhase] = useState<Phase>("look");
  const [wish, setWish] = useState("");
  const [own, setOwn] = useState("");
  const sceneKey = nextSceneKey(state);
  const scene = sceneKey ? STORY_SCENES[sceneKey] : null;
  const resolution = useMemo(() => (sceneKey ? null : resolveStory(state, locale)), [sceneKey, state, locale]);
  const world = useMemo(() => resolveStory(state, locale).world, [state, locale]);
  const look = state.look ?? STORY_LOOKS[0];

  function choose(choiceKey: string) {
    if (!sceneKey) return;
    playUiSound("action");
    const next: StoryState = { ...state, answers: [...state.answers, { scene: sceneKey, choice: choiceKey }] };
    setState(next);
    trackProductEvent("story_choice", { scene: sceneKey, choice: choiceKey, index: next.answers.length });
    if (!nextSceneKey(next)) {
      const result = resolveStory(next, locale);
      setWish(result.wish);
      setPhase("wish");
      trackProductEvent("story_resolved", { motive: result.motive, obstacle: result.obstacle });
    }
  }

  function save(title: string, answer: "yes" | "almost" | "other") {
    if (!resolution || !title.trim()) return;
    setWish(title.trim());
    storeGuestQuest({ motives: [questMotiveFor(resolution.motive), "wish"], wish: { key: `story_${resolution.motive}`, title: title.trim().slice(0, 120) } });
    try {
      window.localStorage.setItem(STORY_STORAGE.result, JSON.stringify({ look, tags: storyTags(state), answers: state.answers, wish: title.trim(), answer, at: new Date().toISOString() }));
    } catch {
      // Without storage the tags are simply not kept for the agent profile.
    }
    trackProductEvent("story_wish_answer", { answer, motive: resolution.motive });
    playUiSound("reward");
    setPhase("world");
  }

  function skip() {
    trackProductEvent("story_skipped", { phase, index: state.answers.length });
    onSkip();
  }

  return (
    <section className="quest-scene first-story">
      <div className="first-story-world" aria-hidden="true">
        <span className="first-story-hero">{look}</span>
        {world.map((item) => <span className="first-story-item" key={item.icon}>{item.icon}</span>)}
      </div>

      {phase === "look" ? (
        <>
          <p className="quest-scene-text">{storyUi("lookTitle", locale)}</p>
          <div className="first-story-looks" role="group" aria-label={storyUi("lookTitle", locale)}>
            {STORY_LOOKS.map((item) => (
              <button className={item === look ? "quest-choice selected" : "quest-choice"} key={item} type="button" onClick={() => { setState({ ...state, look: item }); setPhase("scene"); trackProductEvent("story_started", {}); }}>
                <span aria-hidden="true">{item}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {phase === "scene" && scene ? (
        <>
          <span className="quest-scene-step">{storyUi("scene", locale, { n: state.answers.length + 1, total: storySceneCount() })} · {storyText(scene.title, locale)}</span>
          <p className="quest-scene-text">{storyText(scene.text, locale)}</p>
          <div className="quest-choices" role="group" aria-label={storyText(scene.title, locale)}>
            {scene.choices.map((choice) => (
              <button className="quest-choice" key={choice.key} type="button" onClick={() => choose(choice.key)}>{storyText(choice.text, locale)}</button>
            ))}
          </div>
        </>
      ) : null}

      {resolution && (phase === "wish" || phase === "almost" || phase === "other") ? (
        <>
          <span className="quest-scene-step">{storyUi("novaSays", locale)}</span>
          <p className="quest-scene-text">{resolution.sentence} {storyUi("wishQuestion", locale, { wish: resolution.wish })}</p>
          {phase === "wish" ? (
            <div className="quest-choices">
              <button className="quest-choice" type="button" onClick={() => save(resolution.wish, "yes")}>{storyUi("yes", locale)}</button>
              <button className="quest-choice" type="button" onClick={() => setPhase("almost")}>{storyUi("almost", locale)}</button>
              <button className="quest-choice" type="button" onClick={() => setPhase("other")}>{storyUi("other", locale)}</button>
            </div>
          ) : null}
          {phase === "almost" ? (
            <div className="quest-choices">
              {resolution.alternatives.map((item) => <button className="quest-choice" key={item} type="button" onClick={() => save(item, "almost")}>{item}</button>)}
            </div>
          ) : null}
          {phase === "other" ? (
            <div className="quest-own">
              <textarea maxLength={120} placeholder={storyUi("otherPlaceholder", locale)} value={own} onChange={(event) => setOwn(event.target.value)} />
              <button className="challenge-primary-action" type="button" disabled={!own.trim()} onClick={() => save(own, "other")}>{storyUi("save", locale)}</button>
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "world" && resolution ? (
        <>
          <span className="quest-scene-step">{storyUi("worldTitle", locale)}</span>
          <p className="quest-scene-text first-story-wish">{locale === "ru" ? `«${wish}»` : `“${wish}”`}</p>
          <ul className="first-story-world-list">
            {resolution.world.map((item) => <li key={item.icon}><span aria-hidden="true">{item.icon}</span> {item.text}</li>)}
          </ul>
          <div className="first-story-step">
            <span>{storyUi("firstStep", locale)}</span>
            <strong>{resolution.firstStep}</strong>
          </div>
          <button className="challenge-primary-action" type="button" onClick={() => { trackProductEvent("story_completed", { motive: resolution.motive }); onDone(); }}>{storyUi("continue", locale)}</button>
          <p className="challenge-note">{storyUi("tomorrow", locale)}</p>
        </>
      ) : null}

      {phase !== "world" ? <button className="challenge-secondary-action first-story-skip" type="button" onClick={skip}>{storyUi("skip", locale)}</button> : null}
    </section>
  );
}
