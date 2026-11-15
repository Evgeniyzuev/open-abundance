// The personal agent, first step (Evgen, 2026-11-15): every person's agent is described by a passport (what the
// person can give, what they need, their wishes) and looks for one match among other people's passports. The
// agent only proposes: the person writes the request, the other person answers «Могу», and the usual double
// consent of «Просьба через Нову» applies. The agent never touches money or rules.
import { NEED_TO_OFFERS } from "./coordinatorAnalysis.ts";
import type { RequestKind } from "./novaRequests.ts";

export type AgentPassport = { userId: string; offers: string[]; needs: string[]; consent: boolean; updatedAt?: string | null };
export type AgentMatch = { need: string; helperId: string; offer: string | null };

/** Which kind of request a need turns into. */
export const NEED_KIND: Record<string, RequestKind> = {
  first_step: "advice",
  feedback: "help",
  accountability: "partner",
  skill_teacher: "advice",
  first_client: "help",
  contacts: "help",
  time: "talk",
  funding: "advice"
};

/**
 * One match for the person: the first of their needs that another consenting person can serve. A need with a
 * list of offers is served by someone who offers one of them; «accountability» is served by someone who needs it
 * too. People already asked recently are skipped, so the agent brings a new person each time; among the rest the
 * most recently updated passport wins, because that person is more likely to be around.
 */
export function findAgentMatch(input: { me: AgentPassport; others: AgentPassport[]; skip?: Set<string>; excluded?: (userId: string) => boolean }): AgentMatch | null {
  if (!input.me.consent) return null;
  const pool = input.others
    .filter((other) => other.consent && other.userId !== input.me.userId && !input.skip?.has(other.userId) && !input.excluded?.(other.userId))
    .sort((left, right) => (Date.parse(right.updatedAt ?? "") || 0) - (Date.parse(left.updatedAt ?? "") || 0) || left.userId.localeCompare(right.userId));
  for (const need of input.me.needs) {
    const wanted = NEED_TO_OFFERS[need];
    for (const other of pool) {
      if (wanted) {
        const offer = other.offers.find((item) => wanted.includes(item));
        if (offer) return { need, helperId: other.userId, offer };
      } else if (need === "accountability" && other.needs.includes("accountability")) {
        return { need, helperId: other.userId, offer: null };
      }
    }
  }
  return null;
}

export type AgentView = {
  /** The person filled the passport and agreed to matching. */
  ready: boolean;
  offers: number;
  needs: number;
  /** What the agent found today. Never the other person's id or name. */
  suggestion: { need: string; offer: string | null; kind: RequestKind } | null;
};

export function viewAgent(me: AgentPassport | null, match: AgentMatch | null): AgentView {
  return {
    ready: Boolean(me?.consent && (me.needs.length || me.offers.length)),
    offers: me?.offers.length ?? 0,
    needs: me?.needs.length ?? 0,
    suggestion: match ? { need: match.need, offer: match.offer, kind: NEED_KIND[match.need] ?? "help" } : null
  };
}
