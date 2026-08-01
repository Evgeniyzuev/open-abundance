import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib"];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const sourceFiles = sourceRoots
  .flatMap((directory) => walk(join(root, directory)))
  .filter((path) => /\.(?:ts|tsx)$/.test(path));

const providerGatewayPath = "lib/ai/providerGateway.ts";
const providerEndpointPattern = /generativelanguage\.googleapis\.com|api\.groq\.com|openrouter\.ai\/api\/v1/;

for (const path of sourceFiles) {
  const relativePath = relative(root, path).replaceAll("\\", "/");
  const source = readFileSync(path, "utf8");

  if (providerEndpointPattern.test(source)) {
    assert.equal(
      relativePath,
      providerGatewayPath,
      `Direct AI provider call found outside ${providerGatewayPath}: ${relativePath}`
    );
  }

  if (/^[\s\S]*?["']use client["'];/.test(source)) {
    assert.doesNotMatch(
      source,
      /@\/lib\/ai\/(?:knowledge|providerGateway)/,
      `Server AI knowledge imported by client module: ${relativePath}`
    );
  }
}

const aiRoutes = sourceFiles.filter((path) =>
  relative(root, path).replaceAll("\\", "/").match(/^app\/api\/ai\/.+\/route\.ts$/)
);

assert.ok(aiRoutes.length > 0, "No AI routes found.");
const generationRoutes = aiRoutes.filter((path) => {
  const relativePath = relative(root, path).replaceAll("\\", "/");
  return !relativePath.includes("app/api/ai/settings/") && !relativePath.includes("app/api/ai/openrouter/");
});
for (const path of generationRoutes) {
  const relativePath = relative(root, path).replaceAll("\\", "/");
  const source = readFileSync(path, "utf8");
  assert.match(source, /buildAiSystemPrompt/, `${relativePath} does not use the shared system prompt builder.`);
  assert.match(source, /@\/lib\/ai\/providerGateway/, `${relativePath} bypasses the shared provider gateway.`);
}

const knowledge = read("lib/ai/knowledge.ts");
for (const required of [
  "AI_KNOWLEDGE_VERSION",
  "docs/OPEN_ABUNDANCE_LORE.md",
  "docs/OPEN_ABUNDANCE_MASTER_PLAN.md",
  "docs/OPEN_ABUNDANCE_SYSTEM_GROWTH_PLAN.md",
  "docs/PROJECT_MEMORY.md",
  "strictly non-decreasing",
  "20 levels to $1,000,000 Core",
  "main numerical KPI is Total Core",
  "system challenges award Core only",
  "Current priority 1",
  "Current priority 2",
  "10% of the positive Core growth",
  "Quality-gate",
  "explain -> suggest -> prepare for confirmation -> execute",
]) {
  assert.ok(knowledge.includes(required), `Unified AI knowledge is missing required contract: ${required}`);
}

const chatRoute = read("app/api/ai/chat/route.ts");
assert.match(chatRoute, /capability: "chat\.general"/);

const reflectionRoute = read("app/api/ai/reflections/step/route.ts");
assert.match(reflectionRoute, /capability: "reflection\.process"/);
assert.match(reflectionRoute, /generateAiJson\(\{/);
assert.match(reflectionRoute, /validate: \(value\) => validateModelResponse/);
assert.match(reflectionRoute, /<private_note>/);

console.log(`AI contract verified: ${generationRoutes.length} generation routes use one knowledge base and provider gateway.`);
