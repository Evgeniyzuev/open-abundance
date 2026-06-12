import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ProjectApplication = {
  status: string | null;
  updated_at?: string | null;
  user_id?: string | null;
};

type ProjectTask = Pick<
  Database["public"]["Tables"]["project_tasks"]["Row"],
  "id" | "title" | "description" | "reward_label" | "difficulty_level" | "verification_type" | "sort_order" | "is_active"
>;

type ProjectWithRelations = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  "id" | "title" | "description" | "instructions" | "requirements" | "category" | "level" | "max_participants" | "current_participants" | "deadline" | "owner_name" | "image_url" | "priority"
> & {
  project_applications?: ProjectApplication[] | null;
  project_tasks?: ProjectTask[] | null;
};

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authRequired = request.nextUrl.searchParams.get("auth") === "required";

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (authRequired && !accessToken) {
    return NextResponse.json({ error: "Missing Supabase access token.", authenticated: false }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  let viewerUserId: string | null = null;

  if (accessToken) {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(accessToken);

    if (userError) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    if (user) viewerUserId = user.id;
  }

  const query = supabase
    .from("projects")
    .select(
      viewerUserId
        ? "id,title,description,instructions,requirements,category,level,max_participants,current_participants,deadline,owner_name,image_url,priority,project_applications(status,updated_at,user_id),project_tasks(id,title,description,reward_label,difficulty_level,verification_type,sort_order,is_active)"
        : "id,title,description,instructions,requirements,category,level,max_participants,current_participants,deadline,owner_name,image_url,priority,project_tasks(id,title,description,reward_label,difficulty_level,verification_type,sort_order,is_active)"
    )
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (viewerUserId) {
    query.eq("project_applications.user_id", viewerUserId);
  }

  const { data: projects, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  let userProjectCount = 0;
  const data = ((projects ?? []) as unknown as ProjectWithRelations[]).map((project) => {
    const [application] = project.project_applications ?? [];
    if (application?.status) userProjectCount += 1;
    const { project_applications: _applications, project_tasks: projectTasks, ...publicProject } = project;

    return {
      ...publicProject,
      project_tasks: (projectTasks ?? [])
        .filter((task) => task.is_active)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map(({ is_active: _isActive, ...task }) => task),
      user_application_status: application?.status ? String(application.status).trim().toLowerCase() : null
    };
  });

  return NextResponse.json(
    {
      authenticated: Boolean(viewerUserId),
      viewerUserId,
      userProjectCount,
      projects: data
    },
    {
      headers: NO_STORE_HEADERS
    }
  );
}
