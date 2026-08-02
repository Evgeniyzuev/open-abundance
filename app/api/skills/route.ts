import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { localizedList, localizedText, type SkillPassportPayload, type SkillVerificationLogic } from "@/lib/skills";
import { asSkillDbClient, isMissingSkillSchemaError } from "@/lib/skillsServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Locale = "ru" | "en";

export async function GET(request: NextRequest) {
  const { supabase, user, error: authError } = await getAuthenticatedUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to open Skill Passport." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const locale: Locale = request.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "en";
  const db = asSkillDbClient(supabase);

  try {
    const refreshResult = await db.rpc("refresh_user_skill_levels", { p_user_id: user.id });
    if (refreshResult.error) {
      return NextResponse.json(
        { error: isMissingSkillSchemaError(refreshResult.error) ? "Skill Passport is waiting for its database migration." : refreshResult.error.message },
        { status: isMissingSkillSchemaError(refreshResult.error) ? 503 : 500, headers: NO_STORE_HEADERS }
      );
    }

    const [skillsResult, rulesResult, userSkillsResult, profileResult] = await Promise.all([
      db.from("skills").select("id,slug,title,description,learning_path,is_active").eq("is_active", true).order("slug"),
      db.from("skill_level_rules").select("id,skill_id,level,verification_logic,threshold,requirements,metadata").order("level"),
      db.from("user_skills").select("user_id,skill_id,earned_skill_level,status,last_checked_at,verification_snapshot").eq("user_id", user.id),
      db.from("user_profiles").select("level").eq("user_id", user.id).maybeSingle()
    ]);

    const firstError = [skillsResult, rulesResult, userSkillsResult, profileResult].map((result) => result.error).find(Boolean);
    if (firstError) {
      return NextResponse.json(
        { error: isMissingSkillSchemaError(firstError) ? "Skill Passport is waiting for its database migration." : firstError.message },
        { status: isMissingSkillSchemaError(firstError) ? 503 : 500, headers: NO_STORE_HEADERS }
      );
    }

    const rulesBySkillId = new Map<string, any[]>();
    for (const rule of rulesResult.data ?? []) {
      const current = rulesBySkillId.get(rule.skill_id) ?? [];
      current.push(rule);
      rulesBySkillId.set(rule.skill_id, current);
    }
    const userSkillBySkillId = new Map((userSkillsResult.data ?? []).map((skill: any) => [skill.skill_id, skill]));
    const coreLevel = Number(profileResult.data?.level ?? 0);
    const skills = (skillsResult.data ?? []).map((skill: any) => {
      const userSkill = userSkillBySkillId.get(skill.id);
      const earnedLevel = Number(userSkill?.earned_skill_level ?? 0);
      const snapshotChecks: any[] = Array.isArray(userSkill?.verification_snapshot?.checks)
        ? userSkill.verification_snapshot.checks
        : [];
      const snapshotByLevel = new Map(snapshotChecks.map((check: any) => [Number(check.level), check]));

      return {
        id: skill.id,
        slug: skill.slug,
        title: localizedText(skill.title, locale),
        description: localizedText(skill.description, locale),
        learningPath: localizedList(skill.learning_path, locale),
        earnedLevel,
        effectiveLevel: Math.min(earnedLevel, coreLevel),
        status: userSkill?.status === "verified" ? ("verified" as const) : ("unverified" as const),
        lastCheckedAt: userSkill?.last_checked_at ?? null,
        checks: (rulesBySkillId.get(skill.id) ?? []).map((rule: any) => {
          const check = snapshotByLevel.get(Number(rule.level));
          return {
            level: Number(rule.level),
            verificationLogic: rule.verification_logic as SkillVerificationLogic,
            threshold: Number(rule.threshold),
            currentValue: Number(check?.current_value ?? 0),
            requirements: localizedText(rule.requirements, locale),
            passed: Boolean(check?.passed ?? earnedLevel >= Number(rule.level))
          };
        })
      };
    });

    const checkedAt = (userSkillsResult.data ?? [])
      .map((row: any) => row.last_checked_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    const payload: SkillPassportPayload = { coreLevel, skills, checkedAt };
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (loadError) {
    return NextResponse.json({ error: loadError instanceof Error ? loadError.message : "Could not load Skill Passport." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
