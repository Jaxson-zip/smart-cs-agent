import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_POLICY_BYTES = 256 * 1024;
const POLICY_ARTIFACT_DIR = resolve(
  repoRoot,
  "production-branch-protection-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "repository",
  "protectedBranches",
  "requiredStatusChecks",
  "pullRequestReviews",
  "mergePolicy",
  "safety",
]);
const REPOSITORY_KEYS = new Set(["repositoryFingerprint", "defaultBranch"]);
const REQUIRED_STATUS_CHECKS_KEYS = new Set(["strict", "contexts"]);
const PULL_REQUEST_REVIEW_KEYS = new Set([
  "required",
  "requiredApprovingReviewCount",
  "dismissStaleReviews",
  "requireCodeOwnerReviews",
  "requireLastPushApproval",
]);
const MERGE_POLICY_KEYS = new Set([
  "requireConversationResolution",
  "requireLinearHistory",
  "allowForcePushes",
  "allowDeletions",
  "bypassActors",
]);
const SAFETY_KEYS = new Set([
  "secretsInEvidence",
  "rawTokensInEvidence",
  "githubApiCalledByVerifier",
  "branchProtectionMutatedByVerifier",
  "productionDeploymentTriggered",
]);
const FORBIDDEN_FIELD_NAMES = new Set([
  "accesstoken",
  "apikey",
  "clientsecret",
  "githubtoken",
  "installationtoken",
  "password",
  "pat",
  "privatekey",
  "secret",
  "signature",
  "token",
]);
const FORBIDDEN_VALUE_PATTERNS = [
  /\bghp_[A-Za-z0-9_]+\b/,
  /\bgithub_pat_[A-Za-z0-9_]+\b/,
  /\bbearer\s+[a-z0-9._~+/=-]+/i,
  /\b(?:access|api|github|operator|provider)[_-]?(?:key|secret|token)=/i,
  /\b(?:secret|vault):\/\//i,
  /actual_provider_token_must_not_leak/i,
  /plain_secret_token_must_not_leak/i,
  /user:secret/i,
];

function main() {
  const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);
  const content = readStaticContent();

  verifyStaticArtifacts(content);

  let defaultBranch = undefined;
  if (hasValue(args.policy)) {
    const policy = readJsonFile(args.policy, "Production branch protection policy");
    if (policy) {
      validateBranchProtectionPolicy(policy, args);
      if (isRecord(policy) && isRecord(policy.repository)) {
        defaultBranch = policy.repository.defaultBranch;
      }
    }
  } else if (args.requirePass) {
    failures.push("production branch protection policy is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Production branch protection verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Production branch protection verification passed.");
  if (hasValue(args.policy)) {
    console.log(`- defaultBranch=${defaultBranch}`);
    console.log("- policy=verified");
  } else {
    console.log("- policy=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    branchProtectionDocs: "docs/deploy/production-branch-protection.md",
    staticCiDocs: "docs/deploy/production-static-ci.md",
    staticCiWorkflow: ".github/workflows/production-static-gates.yml",
    launchRunbook: "docs/deploy/production-launch-runbook.md",
    productionReadiness: "docs/deploy/production-readiness.md",
    productionLaunchVerifier: "scripts/verify-production-launch.mjs",
    branchProtectionTest: "scripts/verify-production-branch-protection.test.mjs",
    taskPlan: "task_plan.md",
    progress: "progress.md",
    gitignore: ".gitignore",
  };

  return Object.fromEntries(
    Object.entries(files).map(([label, relativePath]) => [
      label,
      readRequired(label, relativePath),
    ]),
  );
}

function verifyStaticArtifacts(content) {
  mustContainAll("package scripts", content.packageJson, [
    "verify:production-branch-protection",
    "scripts/verify-production-branch-protection.mjs",
  ]);

  mustContainAll("branch protection docs", content.branchProtectionDocs, [
    "PR56 Production Branch Protection Gate",
    "npm run verify:production-branch-protection",
    "npm run verify:production-branch-protection:safe",
    "smart-cs-agent.production-branch-protection.v1",
    "Static production gates",
    "required status check",
    "pull request review",
    "does not call the GitHub API",
    "does not mutate branch protection",
  ]);
  mustNotContainAny("branch protection docs unsafe", content.branchProtectionDocs, [
    "gh auth token",
    "gh api",
    "secrets.",
    "GITHUB_TOKEN=",
    "github_pat_",
    "ghp_",
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
  ]);

  mustContainAll("static CI docs reference branch protection", content.staticCiDocs, [
    "npm run verify:production-branch-protection",
    "docs/deploy/production-branch-protection.md",
  ]);
  mustContainAll("static CI workflow check name", content.staticCiWorkflow, [
    "name: Static production gates",
    "npm run verify:production-static-ci",
  ]);
  mustContainAll("launch runbook references branch protection", content.launchRunbook, [
    "npm run verify:production-branch-protection",
    "npm run verify:production-branch-protection:safe",
    "docs/deploy/production-branch-protection.md",
    "SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE",
    "SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true",
  ]);
  mustContainAll(
    "launch runbook safe env injection references branch protection",
    extractParagraphStartingWith(content.launchRunbook, "Inject `SMARTCS_LAUNCH_ENV_FILE`"),
    [
      "SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE",
      "SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true",
      "sanitized branch protection evidence verification",
      "production branch protection paths",
    ],
  );
  mustContainAll("production readiness references branch protection", content.productionReadiness, [
    "PR56 Production Branch Protection Gate",
    "npm run verify:production-branch-protection",
    "npm run verify:production-branch-protection:safe",
  ]);
  mustContainAll("production launch verifier references branch protection", content.productionLaunchVerifier, [
    "verify:production-branch-protection",
    "production-branch-protection.md",
    "production-branch-protection-artifacts",
  ]);
  mustContainAll("branch protection tests", content.branchProtectionTest, [
    "production branch protection verifier passes static checks without policy evidence",
    "production branch protection verifier accepts sanitized protected-main policy from safe env mode",
    "production branch protection verifier rejects weak required checks and review controls",
    "production branch protection verifier rejects sensitive policy evidence without echoing values",
    "production branch protection verifier rejects policy paths outside the artifact directory",
    "production branch protection verifier redacts unknown argument values",
    "assertNoSecretMarkers",
  ]);
  mustContainAll("task plan references PR56", content.taskPlan, [
    "PR56 - Production Branch Protection Gate",
    "verify:production-branch-protection",
  ]);
  mustContainAll("progress references PR56", content.progress, [
    "Started PR56 production branch protection gate",
    "verify:production-branch-protection",
  ]);
  mustContainAll("gitignore branch protection artifacts", content.gitignore, [
    "production-branch-protection-artifacts/",
  ]);
}

function validateBranchProtectionPolicy(value, options) {
  if (!isRecord(value)) {
    failures.push("production branch protection root must be an object");
    return;
  }

  validateAllowedKeys(value, ROOT_KEYS, "production branch protection contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.production-branch-protection.v1") {
    failures.push("schemaVersion must be smart-cs-agent.production-branch-protection.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }

  validateRepository(value.repository);
  validateProtectedBranches(value.protectedBranches, value.repository, options);
  validateRequiredStatusChecks(value.requiredStatusChecks, options);
  validatePullRequestReviews(value.pullRequestReviews, options);
  validateMergePolicy(value.mergePolicy, options);
  validateSafety(value.safety);
  validateNoSensitiveFields(value);
}

function validateRepository(repository) {
  if (!isRecord(repository)) {
    failures.push("repository must be an object");
    return;
  }
  validateAllowedKeys(repository, REPOSITORY_KEYS, "repository contains unsupported field");
  validateFingerprint("repository.repositoryFingerprint", repository.repositoryFingerprint);
  if (!isSafeBranchName(repository.defaultBranch)) {
    failures.push("repository.defaultBranch must be a safe branch name");
  }
}

function validateProtectedBranches(protectedBranches, repository, options) {
  if (!Array.isArray(protectedBranches) || protectedBranches.length === 0) {
    failures.push("protectedBranches must be a non-empty array");
    return;
  }
  for (const branch of protectedBranches) {
    if (!isSafeBranchName(branch)) {
      failures.push("protectedBranches must contain only safe branch names");
    }
  }
  if (
    options.requirePass &&
    isRecord(repository) &&
    typeof repository.defaultBranch === "string" &&
    !protectedBranches.includes(repository.defaultBranch)
  ) {
    failures.push("protectedBranches must include the default branch");
  }
  if (options.requirePass && !protectedBranches.includes("main")) {
    failures.push("protectedBranches must include main");
  }
}

function validateRequiredStatusChecks(requiredStatusChecks, options) {
  if (!isRecord(requiredStatusChecks)) {
    failures.push("requiredStatusChecks must be an object");
    return;
  }
  validateAllowedKeys(
    requiredStatusChecks,
    REQUIRED_STATUS_CHECKS_KEYS,
    "requiredStatusChecks contains unsupported field",
  );
  validateBoolean("requiredStatusChecks.strict", requiredStatusChecks.strict);
  if (options.requirePass && requiredStatusChecks.strict !== true) {
    failures.push("requiredStatusChecks.strict must be true");
  }
  if (!Array.isArray(requiredStatusChecks.contexts)) {
    failures.push("requiredStatusChecks.contexts must be an array");
  } else {
    for (const context of requiredStatusChecks.contexts) {
      if (typeof context !== "string" || context.trim().length === 0) {
        failures.push("requiredStatusChecks.contexts must contain non-empty strings");
      }
    }
    if (
      options.requirePass &&
      !requiredStatusChecks.contexts.includes("Static production gates")
    ) {
      failures.push("requiredStatusChecks.contexts must include Static production gates");
    }
  }
}

function validatePullRequestReviews(pullRequestReviews, options) {
  if (!isRecord(pullRequestReviews)) {
    failures.push("pullRequestReviews must be an object");
    return;
  }
  validateAllowedKeys(
    pullRequestReviews,
    PULL_REQUEST_REVIEW_KEYS,
    "pullRequestReviews contains unsupported field",
  );
  validateBoolean("pullRequestReviews.required", pullRequestReviews.required);
  validateBoolean("pullRequestReviews.dismissStaleReviews", pullRequestReviews.dismissStaleReviews);
  validateBoolean("pullRequestReviews.requireCodeOwnerReviews", pullRequestReviews.requireCodeOwnerReviews);
  validateBoolean("pullRequestReviews.requireLastPushApproval", pullRequestReviews.requireLastPushApproval);
  if (
    !Number.isInteger(pullRequestReviews.requiredApprovingReviewCount) ||
    pullRequestReviews.requiredApprovingReviewCount < 0 ||
    pullRequestReviews.requiredApprovingReviewCount > 6
  ) {
    failures.push("pullRequestReviews.requiredApprovingReviewCount must be between 0 and 6");
  }
  if (options.requirePass) {
    if (pullRequestReviews.required !== true) {
      failures.push("pullRequestReviews.required must be true");
    }
    if (pullRequestReviews.requiredApprovingReviewCount < 1) {
      failures.push("pullRequestReviews.requiredApprovingReviewCount must be at least 1");
    }
    if (pullRequestReviews.dismissStaleReviews !== true) {
      failures.push("pullRequestReviews.dismissStaleReviews must be true");
    }
    if (pullRequestReviews.requireCodeOwnerReviews !== true) {
      failures.push("pullRequestReviews.requireCodeOwnerReviews must be true");
    }
    if (pullRequestReviews.requireLastPushApproval !== true) {
      failures.push("pullRequestReviews.requireLastPushApproval must be true");
    }
  }
}

function validateMergePolicy(mergePolicy, options) {
  if (!isRecord(mergePolicy)) {
    failures.push("mergePolicy must be an object");
    return;
  }
  validateAllowedKeys(mergePolicy, MERGE_POLICY_KEYS, "mergePolicy contains unsupported field");
  for (const key of [
    "requireConversationResolution",
    "requireLinearHistory",
    "allowForcePushes",
    "allowDeletions",
  ]) {
    validateBoolean(`mergePolicy.${key}`, mergePolicy[key]);
  }
  if (!Array.isArray(mergePolicy.bypassActors)) {
    failures.push("mergePolicy.bypassActors must be an array");
  } else {
    for (const actor of mergePolicy.bypassActors) {
      if (typeof actor !== "string" || actor.trim().length === 0) {
        failures.push("mergePolicy.bypassActors must contain non-empty strings");
      }
    }
  }
  if (options.requirePass) {
    if (mergePolicy.requireConversationResolution !== true) {
      failures.push("mergePolicy.requireConversationResolution must be true");
    }
    if (mergePolicy.requireLinearHistory !== true) {
      failures.push("mergePolicy.requireLinearHistory must be true");
    }
    if (mergePolicy.allowForcePushes !== false) {
      failures.push("mergePolicy.allowForcePushes must be false");
    }
    if (mergePolicy.allowDeletions !== false) {
      failures.push("mergePolicy.allowDeletions must be false");
    }
    if (!Array.isArray(mergePolicy.bypassActors) || mergePolicy.bypassActors.length > 0) {
      failures.push("mergePolicy.bypassActors must be empty");
    }
  }
}

function validateSafety(safety) {
  if (!isRecord(safety)) {
    failures.push("safety must be an object");
    return;
  }
  validateAllowedKeys(safety, SAFETY_KEYS, "safety contains unsupported field");
  for (const key of SAFETY_KEYS) {
    validateBoolean(`safety.${key}`, safety[key]);
    if (safety[key] !== false) {
      failures.push(`safety.${key} must be false`);
    }
  }
}

function readJsonFile(file, label) {
  if (!existsSync(file)) {
    failures.push(`${label} file does not exist`);
    return undefined;
  }
  const stats = statSync(file);
  if (!stats.isFile()) {
    failures.push(`${label} path must point to a file`);
    return undefined;
  }
  if (stats.size > MAX_POLICY_BYTES) {
    failures.push(`${label} file is too large`);
    return undefined;
  }
  try {
    return JSON.parse(stripBom(readFileSync(file, "utf8")));
  } catch {
    failures.push(`${label} file must be valid JSON`);
    return undefined;
  }
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

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

function extractParagraphStartingWith(haystack, prefix) {
  const paragraph = haystack
    .split(/\r?\n\r?\n/)
    .find((item) => item.startsWith(prefix));
  if (!paragraph) {
    failures.push(`missing paragraph starting with ${prefix}`);
    return "";
  }
  return paragraph;
}

function validateNoSensitiveFields(value) {
  walkForSensitiveValues(value);
}

function walkForSensitiveValues(value) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkForSensitiveValues(item));
    return;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (isForbiddenFieldName(key)) {
        failures.push("forbidden sensitive production branch protection field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive production branch protection value");
  }
}

function isForbiddenFieldName(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return FORBIDDEN_FIELD_NAMES.has(normalized);
}

function hasForbiddenValue(value) {
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function validateAllowedKeys(value, allowedKeys, message) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failures.push(message);
    }
  }
}

function parseArgs(values) {
  const parsed = {
    policy: undefined,
    fromEnv: false,
    requirePass: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value.startsWith("--policy=")) {
      parsed.policy = readSafePolicyPath(value.slice("--policy=".length));
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function applySafeEnvDefaults(parsed, input) {
  if (!parsed.fromEnv) return parsed;

  const result = { ...parsed };
  if (
    !hasValue(result.policy) &&
    hasValue(input.SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE)
  ) {
    result.policy = readSafePolicyPath(input.SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE);
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS,
      "SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS",
    );
  return result;
}

function readSafePolicyPath(value) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(POLICY_ARTIFACT_DIR, resolved)) {
      return resolved;
    }
    failures.push("--policy must be inside production-branch-protection-artifacts");
    return undefined;
  }
  failures.push("--policy must be a safe local path");
  return undefined;
}

function readBoolean(value, label) {
  if (!hasValue(value)) return false;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  failures.push(`${label} must be true or false`);
  return false;
}

function isPathInside(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child));
  return (
    relativePath === "" ||
    (relativePath.length > 0 &&
      !relativePath.startsWith("..") &&
      !isAbsolute(relativePath))
  );
}

function redactArgument(value) {
  if (/^https?:\/\//i.test(value)) return "<redacted>";
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

function validateBoolean(label, value) {
  if (typeof value !== "boolean") {
    failures.push(`${label} must be a boolean`);
  }
}

function validateFingerprint(label, value) {
  if (typeof value !== "string" || !/^[a-f0-9]{12}$/.test(value)) {
    failures.push(`${label} must be a 12-character fingerprint`);
  }
}

function isSafeBranchName(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 120 &&
    /^[A-Za-z0-9._/-]+$/.test(value) &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.includes("..") &&
    !value.includes("//")
  );
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main();
