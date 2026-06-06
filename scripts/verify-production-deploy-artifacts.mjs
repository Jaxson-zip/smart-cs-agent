import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  dockerignore: ".dockerignore",
  apiDockerfile: "apps/api/Dockerfile",
  webDockerfile: "apps/web/Dockerfile",
  composeExample: "docker-compose.production.yml.example",
  nextConfig: "apps/web/next.config.ts",
  packageJson: "package.json",
  deploymentDocs: "docs/deploy/production-deployment-artifacts.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  productionLaunchVerifier: "scripts/verify-production-launch.mjs",
  taskPlan: "task_plan.md",
  progress: "progress.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:production-deploy-artifacts",
  "scripts/verify-production-deploy-artifacts.mjs",
]);

mustContainAll("dockerignore", content.dockerignore, [
  ".env",
  ".env.*",
  "node_modules",
  "apps/*/.next",
  "*.log",
  "*.pid",
]);

mustContainAll("api dockerfile", content.apiDockerfile, [
  "FROM node:24-bookworm-slim AS deps",
  "npm ci",
  "npm run db:generate",
  "npm run build --workspace @smart-cs-agent/api",
  "npm prune --omit=dev --workspaces",
  "NODE_ENV=production",
  "WECOM_SANDBOX_ENABLED=false",
  "ENABLE_LEGACY_WEB_DEMO_API=false",
  "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false",
  "USER node",
  "EXPOSE 4100",
  "HEALTHCHECK",
  "/health",
  'CMD ["node", "apps/api/dist/main.js"]',
]);
mustNotContainAny("api dockerfile unsafe", content.apiDockerfile, [
  "npm run start:dev",
  "nest start --watch",
  "WECOM_SANDBOX_ENABLED=true",
  "ENABLE_LEGACY_WEB_DEMO_API=true",
  "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=true",
  "dev_operator_key",
  "tenant_1",
  "replace_with",
]);

mustContainAll("web dockerfile", content.webDockerfile, [
  "FROM node:24-bookworm-slim AS deps",
  "npm ci",
  "npm run build --workspace @smart-cs-agent/web",
  "npm prune --omit=dev --workspaces",
  "NODE_ENV=production",
  "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false",
  "ENABLE_LEGACY_WEB_DEMO_API=false",
  "USER node",
  "EXPOSE 3000",
  "HEALTHCHECK",
  "/api/operator/readiness",
  "response.ok",
  'CMD ["node", "apps/web/server.js"]',
]);
mustNotContainAny("web dockerfile unsafe", content.webDockerfile, [
  "next dev",
  "npm run dev",
  "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=true",
  "ENABLE_LEGACY_WEB_DEMO_API=true",
  "dev_operator_key",
  "tenant_1",
  "replace_with",
]);

mustContainAll("next standalone config", content.nextConfig, [
  'output: "standalone"',
]);

mustContainAll("compose example", content.composeExample, [
  "dockerfile: apps/api/Dockerfile",
  "dockerfile: apps/web/Dockerfile",
  "DATABASE_URL: ${DATABASE_URL:?set DATABASE_URL}",
  "WEB_ORIGIN: ${WEB_ORIGIN:?set WEB_ORIGIN}",
  "OPERATOR_SESSION_SECRET: ${OPERATOR_SESSION_SECRET:?set OPERATOR_SESSION_SECRET}",
  "OPERATOR_API_KEYS: ${OPERATOR_API_KEYS:?set OPERATOR_API_KEYS}",
  "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: ${REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE:?set REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE}",
  "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD: ${CHANNEL_QUEUE_PENDING_WARN_THRESHOLD:?set CHANNEL_QUEUE_PENDING_WARN_THRESHOLD}",
  "OPERATOR_IDENTITY_PROVIDER: database",
  "OPERATOR_ACCOUNT_SOURCE: database",
  'WECOM_SANDBOX_ENABLED: "false"',
  'ENABLE_LEGACY_WEB_DEMO_API: "false"',
  'NEXT_PUBLIC_ENABLE_OFFLINE_DEMO: "false"',
  'ALLOW_INSECURE_OPERATOR_HEADERS: "false"',
  'SMART_CS_LOAD_DOTENV: "false"',
]);
mustNotContainAny("compose example unsafe defaults", content.composeExample, [
  "dev_operator_key",
  "demo_tenant",
  "tenant_1",
  "smartcs:smartcs",
  "replace_with",
  "WECOM_SANDBOX_ENABLED: \"true\"",
  "ENABLE_LEGACY_WEB_DEMO_API: \"true\"",
  "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO: \"true\"",
  "ALLOW_INSECURE_OPERATOR_HEADERS: \"true\"",
]);

mustContainAll("deployment docs", content.deploymentDocs, [
  "PR47 Production Deployment Artifacts",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
  "docker-compose.production.yml.example",
  "npm run verify:production-deploy-artifacts",
  "npm run db:migrate:deploy",
  "npm run operator:bootstrap-admin",
  "npm run verify:production-canary",
  "does not enable real refunds",
  "Do not bake these into Docker images",
]);

mustContainAll("launch runbook references deploy artifacts", content.launchRunbook, [
  "npm run verify:production-deploy-artifacts",
  "docs/deploy/production-deployment-artifacts.md",
  "Deploy the API and Web artifacts",
]);

mustContainAll("production readiness references deploy artifacts", content.productionReadiness, [
  "PR47 Production Deployment Artifacts",
  "npm run verify:production-deploy-artifacts",
  "docker-compose.production.yml.example",
]);

mustContainAll("production launch verifier references deploy artifacts", content.productionLaunchVerifier, [
  "verify:production-deploy-artifacts",
  "production-deployment-artifacts.md",
]);

mustContainAll("task plan references PR47", content.taskPlan, [
  "PR47 - Production Deployment Artifacts",
  "verify:production-deploy-artifacts",
  "docker-compose.production.yml.example",
]);

mustContainAll("progress references PR47", content.progress, [
  "Started PR47 production deployment artifacts",
  "verify:production-deploy-artifacts",
]);

if (failures.length > 0) {
  console.error("Production deploy artifact verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production deploy artifact verification passed.");

function readRequired(label, relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${label}: missing file ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function mustContainAll(label, haystack, needles) {
  for (const needle of needles) {
    if (!haystack.includes(needle)) {
      failures.push(`${label}: missing ${needle}`);
    }
  }
}

function mustNotContainAny(label, haystack, needles) {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      failures.push(`${label}: unexpectedly contains ${needle}`);
    }
  }
}
