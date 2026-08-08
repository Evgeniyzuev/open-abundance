import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (file) => readFileSync(resolve(root, file), "utf8");
const migration = read("supabase/migrations/20260802150000_skill_passport_software_creation_l1.sql");
const level2Migration = read("supabase/migrations/20260808120000_skill_passport_l2_rules.sql");
const passportApi = read("app/api/skills/route.ts");
const ui = read("components/SkillPassportApp.tsx");
const skillsTypes = read("lib/skills.ts");
const skillsI18n = read("lib/skillsI18n.ts");

const reviewArtifacts = [
  "skill_submissions",
  "skill_evidence",
  "skill_review_requests",
  "skill_review_decisions",
  "skill_progress_events",
  "submit_skill_evidence",
  "claim_skill_review_request",
  "record_skill_review_decision",
  "reviewQueue",
  "ReviewQueue",
  "ReviewForm"
];

const checks = [
  ["skill catalog table", migration.includes("create table if not exists public.skills")],
  ["automatic level rules table", migration.includes("create table if not exists public.skill_level_rules")],
  ["user skill RPG levels", migration.includes("create table if not exists public.user_skills")],
  ["verification logic column", migration.includes("verification_logic text not null")],
  ["threshold column", migration.includes("threshold bigint not null")],
  ["server refresh RPC", migration.includes("create or replace function public.refresh_user_skill_levels") && passportApi.includes("refresh_user_skill_levels")],
  ["referral count check", migration.includes("referral_count") && migration.includes("from public.referral_edges")],
  ["public post count check", migration.includes("public_post_count") && migration.includes("from public.feed_posts")],
  ["team member count check", migration.includes("team_member_count") && migration.includes("from public.team_memberships")],
  ["server snapshot", migration.includes("verification_snapshot") && passportApi.includes("current_value")],
  ["level 2 forward migration", level2Migration.includes("'referral_acquisition',") && level2Migration.includes("'content_creation',") && level2Migration.includes("'team_building',") && level2Migration.includes("      5::bigint") && level2Migration.includes("      3::bigint")],
  ["no-store passport API", passportApi.includes('export const dynamic = "force-dynamic"') && passportApi.includes("NO_STORE_HEADERS")],
  ["automatic progress UI", ui.includes("nextCheck") && ui.includes("progressTrack") && ui.includes("refresh")],
  ["compact skill card UI", ui.includes("nextCheck") && ui.includes("🔼{skill.effectiveLevel}") && ui.includes("nextCheck.currentValue") && ui.includes("nextCheck.threshold") && ui.includes("nextCheck.requirements") && !ui.includes("currentCheck") && !ui.includes("skill.checks.at(-1)")],
  ["automatic logic labels", skillsI18n.includes("referralCount") && skillsI18n.includes("publicPostCount")],
  ["review is absent from current contract", reviewArtifacts.every((artifact) => !migration.includes(artifact) && !level2Migration.includes(artifact) && !passportApi.includes(artifact) && !ui.includes(artifact) && !skillsTypes.includes(artifact) && !skillsI18n.includes(artifact))],
  ["review routes removed", !existsSync(resolve(root, "app/api/skills/submissions/route.ts")) && !existsSync(resolve(root, "app/api/skills/reviews/route.ts"))]
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  console.error("Skill contract verification failed:");
  failed.forEach(([name]) => console.error(`- ${name}`));
  process.exit(1);
}

console.log(`Skill contract verification passed (${checks.length} checks).`);
