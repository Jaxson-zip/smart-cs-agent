import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  evidenceScript: "scripts/generate-launch-evidence.mjs",
  evidenceTest: "scripts/generate-launch-evidence.test.mjs",
  preflightScript: "scripts/verify-merchant-launch-preflight.mjs",
  preflightTest: "scripts/verify-merchant-launch-preflight.test.mjs",
  archiveVerifier: "scripts/verify-launch-evidence-archive.mjs",
  archiveTest: "scripts/verify-launch-evidence-archive.test.mjs",
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
  "generate:launch-evidence:safe",
  "verify:merchant-launch-preflight:safe",
  "verify:launch-evidence-archive",
  "verify:launch-evidence-archive:safe",
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
  "--from-env",
  "SMARTCS_LAUNCH_EVIDENCE_OUT",
  "SMARTCS_LAUNCH_TENANT",
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

mustContainAll("merchant preflight safe env support", content.preflightScript, [
  "--from-env",
  "SMARTCS_LAUNCH_ENV_FILE",
  "SMARTCS_LAUNCH_TENANT",
  "SMARTCS_LAUNCH_CHANNEL",
  "SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL",
  "SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY",
]);

mustContainAll("evidence tests", content.evidenceTest, [
  "launch evidence bundle writes sanitized JSON for a ready merchant",
  "launch evidence bundle reads launch target from safe env mode",
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

mustContainAll("merchant preflight tests", content.preflightTest, [
  "merchant launch preflight reads launch target from safe env mode",
  "SMARTCS_LAUNCH_TENANT",
  "SMARTCS_LAUNCH_ENV_FILE",
]);

mustContainAll("archive verifier", content.archiveVerifier, [
  "Launch evidence archive verification passed.",
  "Launch evidence archive verification failed:",
  "SMARTCS_LAUNCH_EVIDENCE_FILE",
  "SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS",
  "forbidden sensitive archive field",
  "forbidden sensitive archive value",
]);
mustNotContainAny("archive verifier forbidden execution", content.archiveVerifier, [
  "fetch(",
  "execFile",
  "spawn(",
  "http.request",
  "https.request",
  "PrismaClient",
]);

mustContainAll("archive tests", content.archiveTest, [
  "launch evidence archive verifier accepts a sanitized passing bundle",
  "launch evidence archive verifier reads archive target from safe env mode",
  "launch evidence archive verifier rejects bundles with raw sensitive fields",
  "launch evidence archive verifier redacts unknown argument values",
  "assertNoSecretMarkers",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR45 Launch Evidence Archive Safety",
  "npm run verify:merchant-launch-preflight:safe",
  "npm run generate:launch-evidence:safe",
  "npm run verify:launch-evidence-archive:safe",
  "SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true",
  "SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true",
  "SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS=true",
  "PR44 Launch Evidence Bundle",
  "npm run generate:launch-evidence",
  "npm run verify:launch-evidence",
  "smart-cs-agent.launch-evidence.v1",
  "tenantFingerprint",
  "credentialRefFingerprint",
]);

mustContainAll("launch runbook", content.launchRunbook, [
  "npm run generate:launch-evidence:safe",
  "npm run verify:merchant-launch-preflight:safe",
  "npm run verify:launch-evidence-archive:safe",
  "npm run verify:launch-evidence",
  "SMARTCS_LAUNCH_EVIDENCE_OUT",
  "SMARTCS_LAUNCH_EVIDENCE_FILE",
  "SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS=true",
  "launch evidence bundle",
  "must not include raw tenant IDs",
]);

mustContainAll("production launch verifier", content.productionLaunchVerifier, [
  "generate:launch-evidence",
  "generate:launch-evidence:safe",
  "verify:launch-evidence-archive",
  "verify:launch-evidence",
]);

mustContainAll("task plan", content.taskPlan, [
  "PR45 - Launch Evidence Archive Safety",
  "generate:launch-evidence",
  "verify:launch-evidence-archive",
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
