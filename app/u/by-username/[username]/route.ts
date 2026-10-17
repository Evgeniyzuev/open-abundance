import { NextRequest } from "next/server";
import { redirectToProfile } from "@/lib/usernameRedirect";

export const dynamic = "force-dynamic";

/** GET /@nickname  (rewritten to /u/by-username/nickname): short link to a public profile. */
export async function GET(request: NextRequest, { params }: { params: { username: string } }) {
  return redirectToProfile(request, params.username, false);
}
