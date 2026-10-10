import { NextRequest, NextResponse } from "next/server";
import {
  buildFunnel,
  buildProposals,
  equityGuard,
  findBottleneck,
  growthComposition,
  summarizeDistribution,
  summarizeSatisfaction
} from "@/lib/coordinatorAnalysis";
import { loadParticipantRecords } from "@/lib/coordinatorData";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/internal/coordinator/digest
 *
 * Operator-only, read-only analyst report: where the pilot loses people, whether Total Core is
 * growing fairly, and how satisfied participants say they are. With `?propose=1` the rule-based
 * proposals are also placed in the approval queue (idempotent per day). Nothing here contacts
 * anyone or changes balances.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  if (!isGrowthOperator(user.id)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });

  const db = supabase as any;
  const now = Date.now();
  const dateKey = new Date(now).toISOString().slice(0, 10);

  let loaded;
  try {
    loaded = await loadParticipantRecords(db, now);
  } catch (loadError) {
    return NextResponse.json({ error: loadError instanceof Error ? loadError.message : "Could not build digest." }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const { participants, truncated } = loaded;

  const proposals = buildProposals(participants, dateKey, now);
  let queued = 0;
  if (request.nextUrl.searchParams.get("propose") === "1" && proposals.length > 0) {
    const { data, error: insertError } = await db
      .from("coordinator_recommendations")
      .upsert(
        proposals.map((proposal) => ({
          dedupe_key: proposal.dedupeKey,
          kind: proposal.kind,
          title: proposal.title,
          rationale: proposal.rationale,
          expected_effect: proposal.expectedEffect,
          risk: proposal.risk,
          target_user_ids: proposal.targetUserIds,
          payload: proposal.payload,
          source: "rules"
        })),
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      )
      .select("id");
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500, headers: NO_STORE_HEADERS });
    queued = data?.length ?? 0;
  }

  const composition = growthComposition(participants.map((participant) => participant.coreGrowth));
  return NextResponse.json(
    {
      asOf: new Date(now).toISOString(),
      participants: participants.length,
      truncated,
      totalCore: {
        ...summarizeDistribution(participants.map((participant) => participant.coreBalance)),
        composition,
        equity: equityGuard(participants)
      },
      funnel: buildFunnel(participants),
      bottleneck: findBottleneck(participants),
      satisfaction: summarizeSatisfaction(participants),
      proposals: proposals.map((proposal) => ({ ...proposal, targetUserIds: proposal.targetUserIds.map((id) => id.slice(0, 8)) })),
      queued,
      // One row per person with flags only, for the operator's own review. Short ids, no names.
      table: participants.map((participant) => ({
        id: participant.id.slice(0, 8),
        registeredAt: participant.registeredAt.slice(0, 10),
        core: participant.coreBalance,
        stories: participant.storiesViewed,
        wishes: participant.wishes,
        calculator: participant.calculatorUsed,
        challengesDone: participant.challengesCompleted,
        nova: participant.novaMessages,
        returnedDay2: participant.returnedDay2,
        posts: participant.contentPosts,
        externalShares: participant.externalShares,
        invited: participant.referralsInvited,
        helpTags: participant.helpProfile ? participant.helpProfile.offers.length + participant.helpProfile.needs.length : 0
      }))
    },
    { headers: NO_STORE_HEADERS }
  );
}
