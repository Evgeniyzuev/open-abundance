/**
 * Pure analysis used by the coordinator digest. No imports and no I/O so the same code can be
 * checked by a deterministic Node test (`pnpm test:coordinator`).
 *
 * Design rules:
 * - Total Core stays the primary metric; every report shows it next to inequality guardrails.
 * - Satisfaction is reported as separate components with their sample sizes, never as one score.
 * - Small samples are labelled, not smoothed: with a pilot of ~10 people a ratio is a direction.
 */

export type GrowthSources = {
  challengeRewards: number;
  leaderBonus: number;
  reinvest: number;
  walletTopups: number;
  otherSystem: number;
};

export type HelpProfileRecord = { offers: string[]; needs: string[]; consent: boolean };

export type ParticipantRecord = {
  id: string;
  registeredAt: string;
  coreBalance: number;
  coreGrowth: GrowthSources;
  storiesViewed: number;
  wishes: number;
  calculatorUsed: boolean;
  challengesAccepted: number;
  challengesCompleted: number;
  feedbackSubmitted: number;
  novaMessages: number;
  /** null while the person is too new for the question to apply (registered < 48h ago). */
  returnedDay2: boolean | null;
  contentPosts: number;
  externalShares: number;
  referralsInvited: number;
  helpProfile: HelpProfileRecord | null;
  /** Answers to "did this move your wish forward": helped | not_yet | not_relevant. */
  outcomeAnswers: string[];
  checkinAnswer: string | null;
};

// --- Distribution and inequality ----------------------------------------------------------------

export type DistributionSummary = {
  participants: number;
  total: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  gini: number | null;
  top10Share: number | null;
  bottomHalfShare: number | null;
};

export function summarizeDistribution(values: number[]): DistributionSummary {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (n === 0) {
    return { participants: 0, total: 0, mean: 0, median: 0, p10: 0, p90: 0, gini: null, top10Share: null, bottomHalfShare: null };
  }
  return {
    participants: n,
    total,
    mean: total / n,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
    gini: gini(sorted),
    top10Share: total > 0 ? topShare(sorted, 0.1) : null,
    bottomHalfShare: total > 0 ? bottomShare(sorted, 0.5) : null
  };
}

/** Linear-interpolated percentile of an ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

/** Gini coefficient of an ascending array of non-negative values; 0 = equal, near 1 = concentrated. */
export function gini(sorted: number[]): number | null {
  const n = sorted.length;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (n === 0 || total <= 0) return null;
  let weighted = 0;
  sorted.forEach((value, index) => {
    weighted += (index + 1) * value;
  });
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

function topShare(sorted: number[], fraction: number): number {
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const count = Math.max(1, Math.ceil(sorted.length * fraction));
  return sorted.slice(-count).reduce((sum, value) => sum + value, 0) / total;
}

function bottomShare(sorted: number[], fraction: number): number {
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const count = Math.max(1, Math.floor(sorted.length * fraction));
  return sorted.slice(0, count).reduce((sum, value) => sum + value, 0) / total;
}

export type GrowthComposition = {
  /** Core growth excluding reinvestment, which only scales existing Core. */
  newCoreTotal: number;
  /** Share of new Core earned through accepted results (challenges and system rewards). */
  earnedShare: number | null;
  /** Share of new Core that came from topping up with money. Pay-to-win inequality shows up here. */
  topUpShare: number | null;
  leaderShare: number | null;
  reinvestTotal: number;
};

export function growthComposition(rows: GrowthSources[]): GrowthComposition {
  const sum = (pick: (row: GrowthSources) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const earned = sum((row) => row.challengeRewards + row.otherSystem);
  const topUps = sum((row) => row.walletTopups);
  const leader = sum((row) => row.leaderBonus);
  const newCoreTotal = earned + topUps + leader;
  return {
    newCoreTotal,
    earnedShare: newCoreTotal > 0 ? earned / newCoreTotal : null,
    topUpShare: newCoreTotal > 0 ? topUps / newCoreTotal : null,
    leaderShare: newCoreTotal > 0 ? leader / newCoreTotal : null,
    reinvestTotal: sum((row) => row.reinvest)
  };
}

export type EquityVerdict = "insufficient_data" | "ok" | "watch" | "alert";

export type EquityGuard = {
  verdict: EquityVerdict;
  reasons: string[];
  /** Share of participants whose Core grew from accepted results or system rewards. */
  participantsWithEarnedGrowth: number;
  balanceGini: number | null;
  newCoreGini: number | null;
};

export const EQUITY_MIN_PARTICIPANTS = 5;

/**
 * Guardrail for "grow Total Core without growing inequality". It looks at where new Core comes
 * from (results versus money), how many people share in it, and whether the typical person moved.
 * Gini values are reported for context but do not drive the verdict: early in a pilot many people
 * simply have not started yet, which is a participation problem, not unfair growth.
 * Thresholds are starting points for the pilot and are meant to be tuned from real data.
 */
export function equityGuard(participants: ParticipantRecord[]): EquityGuard {
  const n = participants.length;
  const newCore = participants.map((p) => p.coreGrowth.challengeRewards + p.coreGrowth.otherSystem + p.coreGrowth.walletTopups + p.coreGrowth.leaderBonus);
  const balanceGini = gini(participants.map((p) => p.coreBalance).sort((a, b) => a - b));
  const sortedNewCore = [...newCore].sort((a, b) => a - b);
  const newCoreGini = gini(sortedNewCore);
  const earnedParticipants = participants.filter((p) => p.coreGrowth.challengeRewards + p.coreGrowth.otherSystem > 0).length;

  if (n < EQUITY_MIN_PARTICIPANTS) {
    return { verdict: "insufficient_data", reasons: [`fewer than ${EQUITY_MIN_PARTICIPANTS} participants`], participantsWithEarnedGrowth: earnedParticipants, balanceGini, newCoreGini };
  }

  const reasons: string[] = [];
  let verdict: EquityVerdict = "ok";
  const composition = growthComposition(participants.map((p) => p.coreGrowth));
  const raise = (level: "watch" | "alert", reason: string) => {
    if (level === "alert" || verdict === "ok") verdict = level;
    reasons.push(reason);
  };

  if (composition.topUpShare !== null && composition.topUpShare > 0.5) raise("alert", "more than half of new Core comes from top-ups");
  else if (composition.topUpShare !== null && composition.topUpShare > 0.25) raise("watch", "top-ups are over a quarter of new Core");

  if (earnedParticipants / n < 0.5) raise("watch", "fewer than half of participants earned Core from results");
  if (percentile(sortedNewCore, 0.5) === 0) raise("watch", "the median participant gained no new Core");
  if (composition.newCoreTotal > 0 && topShare(sortedNewCore, 0.1) > 0.6) raise("watch", "the top tenth received over 60% of new Core");

  return { verdict, reasons, participantsWithEarnedGrowth: earnedParticipants, balanceGini, newCoreGini };
}

// --- Satisfaction -------------------------------------------------------------------------------

export type Rate = { answered: number; positive: number; rate: number | null };

function rate(answered: number, positive: number): Rate {
  return { answered, positive, rate: answered > 0 ? positive / answered : null };
}

export type SatisfactionSummary = {
  /** "Did this move your wish forward": helped / (helped + not_yet). not_relevant is excluded. */
  wishOutcome: Rate;
  /** Day-2+ check-in: useful_step or useful_option / all answers. */
  checkin: Rate;
  /** People who answered at least one outcome question. Reach of the signal itself. */
  respondents: number;
  participants: number;
};

export function summarizeSatisfaction(participants: ParticipantRecord[]): SatisfactionSummary {
  let outcomeAnswered = 0;
  let outcomeHelped = 0;
  let checkinAnswered = 0;
  let checkinPositive = 0;
  let respondents = 0;
  for (const participant of participants) {
    const answers = participant.outcomeAnswers.filter((answer) => answer === "helped" || answer === "not_yet");
    outcomeAnswered += answers.length;
    outcomeHelped += answers.filter((answer) => answer === "helped").length;
    if (participant.checkinAnswer) {
      checkinAnswered += 1;
      if (participant.checkinAnswer === "useful_step" || participant.checkinAnswer === "useful_option") checkinPositive += 1;
    }
    if (answers.length > 0 || participant.checkinAnswer) respondents += 1;
  }
  return {
    wishOutcome: rate(outcomeAnswered, outcomeHelped),
    checkin: rate(checkinAnswered, checkinPositive),
    respondents,
    participants: participants.length
  };
}

// --- Funnel and bottleneck ----------------------------------------------------------------------

export type FunnelStage = { key: string; users: number; eligible: number; rate: number | null };

type StageDefinition = {
  key: string;
  test: (participant: ParticipantRecord) => boolean | null;
};

export const FUNNEL_STAGES: StageDefinition[] = [
  { key: "viewedStories", test: (p) => p.storiesViewed >= 3 },
  { key: "addedWish", test: (p) => p.wishes >= 1 },
  { key: "calculatedCore", test: (p) => p.calculatorUsed },
  { key: "acceptedChallenge", test: (p) => p.challengesAccepted >= 1 },
  { key: "completedChallenge", test: (p) => p.challengesCompleted >= 1 },
  { key: "completedThree", test: (p) => p.challengesCompleted >= 3 },
  { key: "gaveFeedback", test: (p) => p.feedbackSubmitted >= 1 },
  { key: "talkedToNova", test: (p) => p.novaMessages >= 1 },
  { key: "returnedDay2", test: (p) => p.returnedDay2 },
  { key: "madeContent", test: (p) => p.contentPosts >= 1 },
  { key: "invitedSomeone", test: (p) => p.referralsInvited >= 1 },
  { key: "sharedExternally", test: (p) => p.externalShares >= 1 }
];

export function buildFunnel(participants: ParticipantRecord[]): FunnelStage[] {
  return FUNNEL_STAGES.map(({ key, test }) => {
    let eligible = 0;
    let users = 0;
    for (const participant of participants) {
      const result = test(participant);
      if (result === null) continue;
      eligible += 1;
      if (result) users += 1;
    }
    return { key, users, eligible, rate: eligible > 0 ? users / eligible : null };
  });
}

/** The core path whose weakest step the coordinator tries to fix first. */
export const CORE_PATH = ["viewedStories", "addedWish", "completedChallenge", "returnedDay2"] as const;

export type Bottleneck = { from: string; to: string; conversion: number; reached: number; passed: number } | null;

export function findBottleneck(participants: ParticipantRecord[], minReached = 3): Bottleneck {
  const stages = new Map(FUNNEL_STAGES.map((stage) => [stage.key, stage.test]));
  let worst: Bottleneck = null;
  for (let index = 1; index < CORE_PATH.length; index += 1) {
    const fromTest = stages.get(CORE_PATH[index - 1])!;
    const toTest = stages.get(CORE_PATH[index])!;
    const reachedUsers = participants.filter((p) => fromTest(p) === true && toTest(p) !== null);
    if (reachedUsers.length < minReached) continue;
    const passed = reachedUsers.filter((p) => toTest(p) === true).length;
    const conversion = passed / reachedUsers.length;
    if (!worst || conversion < worst.conversion) {
      worst = { from: CORE_PATH[index - 1], to: CORE_PATH[index], conversion, reached: reachedUsers.length, passed };
    }
  }
  return worst;
}

// --- Proposals ----------------------------------------------------------------------------------

export type Proposal = {
  dedupeKey: string;
  kind: "match" | "challenge" | "outreach" | "experiment" | "support" | "other";
  title: string;
  rationale: string;
  expectedEffect: string;
  risk: string;
  targetUserIds: string[];
  payload: Record<string, unknown>;
};

/** What each weak step suggests. Operator-confirmed; nothing here contacts anyone. */
const BOTTLENECK_ACTIONS: Record<string, { title: string; effect: string }> = {
  "viewedStories>addedWish": {
    title: "Help stalled people write down one wish",
    effect: "More participants with a wish, which every later step builds on"
  },
  "addedWish>completedChallenge": {
    title: "Offer a single small first challenge to people with a wish",
    effect: "More participants reach a first accepted result and a first Core reward"
  },
  "completedChallenge>returnedDay2": {
    title: "Ask people who finished a challenge what would bring them back",
    effect: "Higher day-2 return after a first result"
  }
};

/** Needs that a particular offer can serve. Tags with no entry are only matched peer to peer. */
export const NEED_TO_OFFERS: Record<string, string[]> = {
  skill_teacher: ["tutoring", "ai_helper"],
  feedback: ["writing", "design", "ai_helper"],
  first_client: ["local_help", "digital_products", "writing", "design"]
};

export function buildProposals(participants: ParticipantRecord[], dateKey: string, now: number): Proposal[] {
  const proposals: Proposal[] = [];
  const bottleneck = findBottleneck(participants);
  if (bottleneck) {
    const action = BOTTLENECK_ACTIONS[`${bottleneck.from}>${bottleneck.to}`];
    if (action) {
      const stuck = participants.filter((p) => stageTest(bottleneck.from, p) === true && stageTest(bottleneck.to, p) === false);
      proposals.push({
        dedupeKey: `bottleneck:${bottleneck.from}>${bottleneck.to}:${dateKey}`,
        kind: "outreach",
        title: action.title,
        rationale: `${bottleneck.passed} of ${bottleneck.reached} people who reached "${bottleneck.from}" went on to "${bottleneck.to}".`,
        expectedEffect: action.effect,
        risk: "Small sample. Message people personally and ask before suggesting anything.",
        targetUserIds: stuck.map((p) => p.id).slice(0, 50),
        payload: { bottleneck }
      });
    }
  }

  const stalledNoWish = participants.filter((p) => p.wishes === 0 && now - Date.parse(p.registeredAt) > 24 * 3_600_000);
  if (stalledNoWish.length > 0 && !(bottleneck && bottleneck.from === "viewedStories")) {
    proposals.push({
      dedupeKey: `support:no-wish:${dateKey}`,
      kind: "support",
      title: "Personal nudge for people without a wish after a day",
      rationale: `${stalledNoWish.length} registered over 24 hours ago and have not added a wish.`,
      expectedEffect: "A wish gives the coordinator something to work with",
      risk: "Avoid pressure; one short message offering help is enough.",
      targetUserIds: stalledNoWish.map((p) => p.id).slice(0, 50),
      payload: {}
    });
  }

  proposals.push(...buildMatchProposals(participants, dateKey));
  return proposals;
}

function stageTest(key: string, participant: ParticipantRecord): boolean | null {
  const stage = FUNNEL_STAGES.find((item) => item.key === key);
  return stage ? stage.test(participant) : null;
}

/**
 * Pairs people who both consented to matching. Each person appears in at most one proposal per
 * run, and people with fewer completed challenges are paired first so help reaches the tail of
 * the group rather than those already doing well.
 */
export function buildMatchProposals(participants: ParticipantRecord[], dateKey: string): Proposal[] {
  const candidates = participants
    .filter((p) => p.helpProfile?.consent)
    .sort((a, b) => a.challengesCompleted - b.challengesCompleted || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const proposals: Proposal[] = [];

  for (const seeker of candidates) {
    if (used.has(seeker.id)) continue;
    for (const need of seeker.helpProfile!.needs) {
      const wantedOffers = NEED_TO_OFFERS[need];
      const helper = candidates.find((other) =>
        other.id !== seeker.id
        && !used.has(other.id)
        && (wantedOffers
          ? other.helpProfile!.offers.some((offer) => wantedOffers.includes(offer))
          : need === "accountability" && other.helpProfile!.needs.includes("accountability"))
      );
      if (!helper) continue;
      used.add(seeker.id);
      used.add(helper.id);
      const pair = [seeker.id, helper.id].sort();
      proposals.push({
        dedupeKey: `match:${pair.join("+")}:${need}:${dateKey}`,
        kind: "match",
        title: `Introduce two participants around "${need}"`,
        rationale: need === "accountability"
          ? "Both asked for accountability and agreed to matching."
          : `One needs "${need}" and the other offers a matching direction. Both agreed to matching.`,
        expectedEffect: "A small mutual challenge with a clear result for both",
        risk: "Introduce only after the operator checks fit; never share more than the tags.",
        targetUserIds: pair,
        payload: { need, seeker: seeker.id, helper: helper.id }
      });
      break;
    }
  }
  return proposals;
}
