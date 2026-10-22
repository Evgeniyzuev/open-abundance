import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { telegramMiniAppLink } from "@/lib/telegramMiniAppLink";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    // Everyone who signed in has an invitation link from the first minute (no "first result" gate).
    const { data: existingCode, error: existingError } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const code = existingCode?.code ?? await createReferralCode(supabase, user.id);
    // `url` is a link to the inviter's public blog (the profile and the feed are one tap away): a newcomer can read the profile and blog right away,
    // the code is remembered on the device, and registration later carries it.
    const { data: inviter } = await supabase.from("user_profiles").select("username").eq("user_id", user.id).maybeSingle();
    const url = new URL(inviter?.username ? `/@${inviter.username}/blog` : `/u/${user.id}/blog`, request.nextUrl.origin);
    url.searchParams.set("ref", code);
    url.searchParams.set("utm_medium", "blog");
    // The direct link opens the onboarding (the first screens of the app) with the same code; utm_medium tells the two kinds of link apart.
    const appUrl = new URL("/", request.nextUrl.origin);
    appUrl.searchParams.set("ref", code);
    appUrl.searchParams.set("utm_medium", "invite");

    // The same invitation as a Telegram Mini App link (t.me/<bot>/<app>?startapp=<code>), when the bot is set up.
    const telegramUrl = telegramMiniAppLink(process.env.TELEGRAM_MINI_APP_URL, code);

    return NextResponse.json({ available: true, code, url: url.toString(), appUrl: appUrl.toString(), telegramUrl, reason: null }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load referral link." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function createReferralCode(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomBytes(6).toString("base64url");
    const { error } = await supabase.from("referral_codes").insert({ code, user_id: userId });

    if (!error) return code;
    if (error.code !== "23505") throw error;
  }

  throw new Error("Could not create a unique referral code.");
}
