import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (file) => readFileSync(resolve(root, file), "utf8");
const migration = read("supabase/migrations/20260802150000_skill_passport_software_creation_l1.sql");
const passportApi = read("app/api/skills/route.ts");
const submissionApi = read("app/api/skills/submissions/route.ts");
const reviewApi = read("app/api/skills/reviews/route.ts");
const ui = read("components/SkillPassportApp.tsx");

const checks = [
  ["skill catalog table", migration.includes("create table if not exists public.skills")],
  ["versioned rubric table", migration.includes("create table if not exists public.skill_level_rules")],
  ["user skill RPG levels", migration.includes("create table if not exists public.user_skills")],
  ["immutable evidence table", migration.includes("create table if not exists public.skill_evidence")],
  ["structured review decisions", migration.includes("create table if not exists public.skill_review_decisions")],
  ["three review slots", migration.includes("values (submission_row.id, evidence_row.id, 1), (submission_row.id, evidence_row.id, 2), (submission_row.id, evidence_row.id, 3)")],
  ["evidence immutability trigger", migration.includes("protect_skill_evidence_immutable")],
  ["decision immutability trigger", migration.includes("protect_skill_review_decisions_immutable")],
  ["reviewer level gate", migration.includes("earned_skill_level >= request_row.target_level")],
  ["2/3 pass gate", migration.includes("decided_count = 3 and pass_count >= 2")],
  ["critical issue gate", migration.includes("critical_count > 0")],
  ["effective level cap", migration.includes("least(request_row.target_level, coalesce(core_level, 0))")],
  ["submission RPC", migration.includes("create or replace function public.submit_skill_evidence") && submissionApi.includes("submit_skill_evidence")],
  ["claim RPC", migration.includes("create or replace function public.claim_skill_review_request") && reviewApi.includes("claim_skill_review_request")],
  ["decision RPC", migration.includes("create or replace function public.record_skill_review_decision") && reviewApi.includes("record_skill_review_decision")],
  ["no-store passport API", passportApi.includes('export const dynamic = "force-dynamic"') && passportApi.includes("NO_STORE_HEADERS")],
  ["evidence form fields", ["repoUrl", "proofUrl", "testScenario", "limitations"].every((field) => ui.includes(field))],
  ["review UI", ui.includes("SubmissionReviews") && ui.includes("ReviewQueue") && ui.includes("ReviewForm")]
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  console.error("Skill contract verification failed:");
  failed.forEach(([name]) => console.error(`- ${name}`));
  process.exit(1);
}

console.log(`Skill contract verification passed (${checks.length} checks).`);

