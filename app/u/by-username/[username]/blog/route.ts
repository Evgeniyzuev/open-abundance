import { NextRequest } from "next/server";
import { redirectToProfile } from "@/lib/usernameRedirect";

export const dynamic = "force-dynamic";

/** GET /@nickname/blog  (rewritten to /u/by-username/nickname/blog): short link to a public blog; ?ref= is kept. */
export async function GET(request: NextRequest, { params }: { params: { username: string } }) {
  return redirectToProfile(request, params.username, true);
}
