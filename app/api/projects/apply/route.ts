import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ApplyProjectBody = {
  projectId?: string;
  message?: string;
};

const MAX_MESSAGE_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = (await request.json().catch(() => ({}))) as ApplyProjectBody;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to join a project." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  if (!body.projectId || !isUuid(body.projectId)) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Project application message is too long." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,is_active")
    .eq("id", body.projectId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (!project || !project.is_active) {
    return NextResponse.json({ error: "Project is not available." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const { data: application, error: upsertError } = await supabase
    .from("project_applications")
    .upsert(
      {
        project_id: project.id,
        user_id: user.id,
        status: "pending",
        message: message || null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "project_id,user_id" }
    )
    .select("project_id,status,user_id")
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json(
    {
      projectId: application.project_id,
      status: application.status,
      userId: application.user_id
    },
    {
      headers: NO_STORE_HEADERS
    }
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
