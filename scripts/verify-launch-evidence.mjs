import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  evidenceScript: "scripts/generate-launch-evidence.mjs",
  evidenceTest: "scripts/generate-launch-evidence.test.mjs",
  productionReadiness: "docs/deploy/production-readiness.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
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
  "generate:launch-evidence",
  "scripts/generate-launch-evidence.mjs",
  "verify:launch-evidence",
  "scripts/verify-launch-evidence.mjs",
]);

mustContainAll("evidence script", content.evidenceScript, [
  "smart-cs-agent.launch-evidence.v1",
  "tenantFingerprint",
  "credentialRefFingerprint",
  "liveCanaryIncluded: false",
  "networkAttempted=false",
  "providerDataReturned=false",
  "providerResponseCaptured=false",
  "Launch evidence generation failed.",
  "Launch evidence bundle generated.",
  "sanitizeChannel",
  'flag: "wx"',
  "Output file must not already exist",
  "redactArgument",
]);
mustNotContainAny("evidence script forbidden execution", content.evidenceScript, [
  "fetch(",
  "execFile",
  "spawn(",
  "http.request",
  "https.request",
  "PrismaClient",
  "providerDataReturned=true",
  "networkAttempted=true",
  "providerResponseCaptured=true",
]);

mustContainAll("evidence tests", content.evidenceTest, [
  "launch evidence bundle writes sanitized JSON for a ready merchant",
  "launch evidence bundle fails closed without leaking missing credential refs",
  "launch evidence bundle redacts unknown argument values",
  "launch evidence bundle redacts invalid channel values",
  "launch evidence bundle refuses to overwrite existing output files",
  "assertNoSecretMarkers",
  "tenant_launch_secret",
  "secret://smartcs",
  "super_secret_webhook_value",
  "production_operator_key",
  "plain_secret_token_must_not_leak",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR44 Launch Evidence Bundle",
  "npm run generate:launch-evidence",
  "npm run verify:launch-evidence",
  "smart-cs-agent.launch-evidence.v1",
  "tenantFingerprint",
  "credentialRefFingerprint",
]);

mustContainAll("launch runbook", content.launchRunbook, [
  "npm run generate:launch-evidence",
  "npm run verify:launch-evidence",
  "--out=<launch-evidence-json>",
  "launch evidence bundle",
  "must not include raw tenant IDs",
]);

mustContainAll("production launch verifier", content.productionLaunchVerifier, [
  "generate:launch-evidence",
  "verify:launch-evidence",
]);

mustContainAll("task plan", content.taskPlan, [
  "PR44 - Launch Evidence Bundle",
  "generate:launch-evidence",
  "verify:launch-evidence",
]);

mustContainAll("progress", content.progress, [
  "Started PR44 launch evidence bundle",
  "generate:launch-evidence",
]);

if (failures.length > 0) {
  console.error("Launch evidence verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Launch evidence verification passed.");

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
