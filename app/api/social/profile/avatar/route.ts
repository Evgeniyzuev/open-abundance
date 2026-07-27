import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
const BUCKET = "profile-avatars";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400, headers: NO_STORE_HEADERS });
    if (!MIME_EXTENSIONS[file.type] || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image up to 4 MB." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: current, error: currentError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const path = `${user.id}/${crypto.randomUUID()}.${MIME_EXTENSIONS[file.type]}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const publicUrl = buildPublicUrl(path);
    const { data: profile, error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const previousPath = getStoredPath(current.avatar_url);
    if (previousPath && previousPath !== path) await supabase.storage.from(BUCKET).remove([previousPath]);
    return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to upload avatar." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const { data: current, error: currentError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: profile, error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const previousPath = getStoredPath(current.avatar_url);
    if (previousPath) await supabase.storage.from(BUCKET).remove([previousPath]);
    return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to remove avatar." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function buildPublicUrl(path: string): string {
  const baseUrl = process.env.SUPABASE_URL;
  if (!baseUrl) throw new Error("Supabase server environment variables are missing.");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
}

function getStoredPath(value: string | null): string | null {
  if (!value) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  try {
    const pathname = new URL(value).pathname;
    if (!pathname.includes(marker)) return null;
    const path = pathname.slice(pathname.indexOf(marker) + marker.length);
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}
