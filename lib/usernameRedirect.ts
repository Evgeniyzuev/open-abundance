import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { validateUsername } from "@/lib/username";

/**
 * GET /@nickname  (rewritten to /u/by-username/nickname; ?ref=... is passed on to the profile)
 *
 * Short link to a public profile (/@nickname/blog leads to the blog). A nickname released in the last 30 days still leads to the
 * person who used it, so shared links do not break the moment someone renames. Unknown names get a
 * plain 404. Temporary redirects are used because a nickname can change.
 */
export async function redirectToProfile(request: NextRequest, username: string, toBlog: boolean): Promise<NextResponse> {
  const requested = decodeURIComponent(username);
  const format = validateUsername(requested);
  if (!format.ok && format.reason !== "reserved") return notFound();
  const name = format.ok ? format.value : requested.toLowerCase();

  const db = createServiceSupabaseClient() as any;
  const { data: owner } = await db.from("user_profiles").select("user_id").eq("username", name).is("deleted_at", null).maybeSingle();
  let userId: string | null = owner?.user_id ?? null;

  if (!userId) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const { data: previous } = await db
      .from("username_changes")
      .select("user_id")
      .eq("old_username", name)
      .gt("changed_at", since)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    userId = previous?.user_id ?? null;
  }

  if (!userId) return notFound();
  // The query string travels with the redirect, so a shared link like /@nick?ref=CODE keeps its invitation.
  const query = request.nextUrl.searchParams.toString();
  return NextResponse.redirect(new URL(`/u/${userId}${toBlog ? "/blog" : ""}${query ? `?${query}` : ""}`, request.url), 307);
}

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
