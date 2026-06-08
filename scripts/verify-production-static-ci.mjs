import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const workflowRoot = resolve(repoRoot, ".github/workflows");
const failures = [];

const REQUIRED_RUN_COMMANDS = [
  "npm ci",
  "npm run db:generate",
  "npm run test --workspace @smart-cs-agent/api",
  "npm run test --workspace @smart-cs-agent/web",
  "node --test scripts/verify-production-canary.test.mjs",
  "node --test scripts/verify-merchant-launch-preflight.test.mjs",
  "node --test scripts/generate-launch-evidence.test.mjs",
  "node --test scripts/verify-launch-evidence-archive.test.mjs",
  "node --test scripts/verify-launch-manifest.test.mjs",
  "node --test scripts/verify-production-image-builds.test.mjs",
  "node --test scripts/verify-production-container-smoke.test.mjs",
  "node --test scripts/verify-production-image-security.test.mjs",
  "node --test scripts/verify-production-release-provenance.test.mjs",
  "node --test scripts/verify-production-release-evidence.test.mjs",
  "node --test scripts/verify-production-change-approval.test.mjs",
  "node --test scripts/verify-production-launch-binding.test.mjs",
  "node --test scripts/verify-production-launch.test.mjs",
  "node --test scripts/verify-production-static-ci.test.mjs",
  "node --test scripts/verify-production-branch-protection.test.mjs",
  "node --test scripts/verify-production-provider-write-approval.test.mjs",
  "node --test scripts/verify-provider-write-approval-state.test.mjs",
  "node --test scripts/verify-provider-write-execution-attempts.test.mjs",
  "node --test scripts/verify-provider-write-execution-attempt-visibility.test.mjs",
  "node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs",
  "node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs",
  "node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs",
  "node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs",
  "node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs",
  "node --test scripts/verify-provider-write-kill-switch-rehearsal.test.mjs",
  "npm run typecheck --workspaces --if-present -- --pretty false",
  "npm run lint --workspaces --if-present -- --max-warnings=0",
  "npm run build --workspaces --if-present",
  "npm run verify:production-static-ci",
  "npm run verify:production-branch-protection",
  "npm run verify:production-provider-write-approval",
  "npm run verify:operator-bootstrap",
  "npm run verify:channel-runbook",
  "npm run verify:production-alerting",
  "npm run verify:production-deploy-artifacts",
  "npm run verify:production-image-builds",
  "npm run verify:production-container-smoke",
  "npm run verify:production-image-security",
  "npm run verify:production-release-provenance",
  "npm run verify:production-release-evidence",
  "npm run verify:production-change-approval",
  "npm run verify:production-launch-binding",
  "npm run verify:production-launch",
  "npm run verify:provider-adapters",
  "npm run verify:provider-readonly",
  "npm run verify:provider-read-contract",
  "npm run verify:provider-read-audit",
  "npm run verify:provider-read-operations",
  "npm run verify:provider-write-requests",
  "npm run verify:provider-write-approval-state",
  "npm run verify:provider-write-execution-attempts",
  "npm run verify:provider-write-execution-attempt-visibility",
  "npm run verify:provider-write-payload-escrow-boundary",
  "npm run verify:provider-write-dry-run-rehearsal",
  "npm run verify:provider-write-live-executor-startup-guard",
  "npm run verify:provider-write-live-executor-control-plane",
  "npm run verify:provider-write-kill-switch-control-plane",
  "npm run verify:provider-write-kill-switch-rehearsal",
  "npm run verify:provider-credential-boundary",
  "npm run verify:provider-credential-store",
  "npm run verify:provider-read-harness",
];

const ALLOWED_RUN_COMMANDS = new Set(REQUIRED_RUN_COMMANDS);
const REQUIRED_USES_ACTIONS = [
  "actions/checkout@v4",
  "actions/setup-node@v4",
];
const ALLOWED_USES_ACTIONS = new Set(REQUIRED_USES_ACTIONS);
const SENSITIVE_WORKFLOW_KEY_PATTERN =
  /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|PROVIDER_[A-Z0-9_]*KEY|WEBHOOK_[A-Z0-9_]*SECRET)[A-Z0-9_]*\b/;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const workflowPath = args.workflow ?? join(repoRoot, ".github/workflows/production-static-gates.yml");
  const content = readStaticContent(workflowPath);

  verifyStaticCi(content, workflowPath);

  if (failures.length > 0) {
    console.error("Production static CI verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Production static CI verification passed.");
}

function readStaticContent(workflowPath) {
  return {
    workflow: readRequiredAbsolute("workflow", workflowPath),
    packageJson: readRequired("packageJson", "package.json"),
    staticCiDocs: readRequired("staticCiDocs", "docs/deploy/production-static-ci.md"),
    launchRunbook: readRequired("launchRunbook", "docs/deploy/production-launch-runbook.md"),
    productionReadiness: readRequired("productionReadiness", "docs/deploy/production-readiness.md"),
    productionLaunchVerifier: readRequired(
      "productionLaunchVerifier",
      "scripts/verify-production-launch.mjs",
    ),
    staticCiTest: readRequired(
      "staticCiTest",
      "scripts/verify-production-static-ci.test.mjs",
    ),
    taskPlan: readRequired("taskPlan", "task_plan.md"),
    progress: readRequired("progress", "progress.md"),
  };
}

function verifyStaticCi(content) {
  const workflowRunCommands = extractWorkflowRunCommands(content.workflow);
  const workflowUsesActions = extractWorkflowUsesActions(content.workflow);
  const workflowRunCommandText = workflowRunCommands.join("\n");

  mustContainAll("package scripts", content.packageJson, [
    "verify:production-static-ci",
    "scripts/verify-production-static-ci.mjs",
  ]);

  mustContainAll("workflow triggers and permissions", content.workflow, [
    "name: smart-cs-agent production static gates",
    "pull_request:",
    "push:",
    "workflow_dispatch:",
    "permissions:",
    "contents: read",
    "actions/checkout@v4",
    "actions/setup-node@v4",
    "node-version: 24",
    "cache: npm",
    "CI: \"true\"",
    "NEXT_TELEMETRY_DISABLED: \"1\"",
    "npm ci",
  ]);

  mustContainAllRunCommands("workflow run command allowlist", workflowRunCommands, REQUIRED_RUN_COMMANDS);
  mustOnlyContainAllowedRunCommands("workflow run command allowlist", workflowRunCommands);
  mustContainAllUsesActions("workflow action allowlist", workflowUsesActions, REQUIRED_USES_ACTIONS);
  mustOnlyContainAllowedUsesActions("workflow action allowlist", workflowUsesActions);

  mustNotContainAny("workflow unsafe permissions", content.workflow, [
    "contents: write",
    "id-token: write",
    "packages: write",
    "attestations: write",
    "pull-requests: write",
    "actions: write",
    "checks: write",
    "deployments: write",
    "security-events: write",
  ], "workflow must not request write permissions");

  mustNotContainAny("workflow unsafe secret use", content.workflow, [
    "secrets.",
    "OPERATOR_API_KEYS",
    "OPERATOR_API_KEY",
    "REAL_CHANNEL_WEBHOOK_SECRETS",
    "SMART_CS_API_URL",
    "PROVIDER_CREDENTIALS",
    "DATABASE_URL",
  ], "workflow must not use secrets context");
  mustNotContainSensitiveWorkflowMarkers(content.workflow);

  mustNotContainAny("workflow environment-bound commands", workflowRunCommandText, [
    "verify:production-readiness",
    "verify:production-canary",
    "verify:merchant-launch-preflight",
    "scripts/verify-production-readiness.mjs",
    "scripts/verify-production-canary.mjs",
    "scripts/verify-merchant-launch-preflight.mjs",
    "scripts/generate-launch-evidence.mjs",
    "scripts/verify-launch-evidence-archive.mjs",
    "scripts/verify-launch-manifest.mjs",
    "demo:real-channel-smoke",
    "scripts/demo/real-channel-webhook-smoke.mjs",
    "generate:launch-evidence",
    "verify:launch-evidence-archive:safe",
    "verify:launch-manifest:safe",
    "verify:production-release-provenance:safe",
    "verify:production-release-evidence:safe",
    "verify:production-change-approval:safe",
    "verify:production-launch-binding:safe",
    "db:migrate:deploy",
    ":docker",
    "--docker",
  ], "workflow must not run environment-bound production commands");

  mustNotContainAny("workflow deployment commands", workflowRunCommandText, [
    "curl ",
    "curl.exe",
    "Invoke-WebRequest",
    "wget ",
    "docker login",
    "docker push",
    "docker build",
    "docker compose",
    "--push",
    "cosign sign",
    "cosign attest",
    "aws secretsmanager",
    "gcloud secrets",
    "az keyvault",
    "vault kv",
    "kubectl ",
    "kubectl set image",
    "helm upgrade",
    "fly deploy",
    "vercel --prod",
  ], "workflow must not run deployment or registry commands");

  mustContainAll("static CI docs", content.staticCiDocs, [
    "PR55 Production Static CI Gate",
    ".github/workflows/production-static-gates.yml",
    "npm run verify:production-static-ci",
    "does not call production APIs",
    "does not read GitHub secrets",
  ]);

  mustContainAll("launch runbook references static CI", content.launchRunbook, [
    "npm run verify:production-static-ci",
    "docs/deploy/production-static-ci.md",
  ]);

  mustContainAll("production readiness references static CI", content.productionReadiness, [
    "PR55 Production Static CI Gate",
    "npm run verify:production-static-ci",
  ]);

  mustContainAll("production launch verifier references static CI", content.productionLaunchVerifier, [
    "verify:production-static-ci",
    "production-static-ci.md",
    "production-static-gates.yml",
  ]);

  mustContainAll("static CI tests", content.staticCiTest, [
    "production static CI verifier passes repository workflow checks",
    "production static CI verifier rejects unsafe workflow content",
    "production static CI verifier redacts unknown argument values",
    "production static CI verifier rejects direct production script and Docker-backed commands",
    "assertNoSecretMarkers",
  ]);

  mustContainAll("task plan references PR55", content.taskPlan, [
    "PR55 - Production Static CI Gate",
    "verify:production-static-ci",
  ]);

  mustContainAll("progress references PR55", content.progress, [
    "Started PR55 production static CI gate",
    "verify:production-static-ci",
  ]);
}

function parseArgs(values) {
  const parsed = { workflow: undefined };
  for (const value of values) {
    if (value.startsWith("--workflow=")) {
      parsed.workflow = readSafeWorkflowPath(value.slice("--workflow=".length));
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }
  return parsed;
}

function readSafeWorkflowPath(value) {
  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(workflowRoot, resolved)) {
      return resolved;
    }
    failures.push("--workflow must be inside .github/workflows");
    return undefined;
  }
  failures.push("--workflow must be a safe local path");
  return undefined;
}

function readRequired(label, relativePath) {
  return readRequiredAbsolute(label, join(repoRoot, relativePath));
}

function readRequiredAbsolute(label, absolutePath) {
  if (!absolutePath || !existsSync(absolutePath)) {
    failures.push(`${label}: missing file`);
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

function mustContainAllRunCommands(label, commands, requiredCommands) {
  const commandSet = new Set(commands);
  for (const command of requiredCommands) {
    if (!commandSet.has(command)) {
      failures.push(`${label}: missing exact run command ${command}`);
    }
  }
}

function mustOnlyContainAllowedRunCommands(label, commands) {
  for (const command of commands) {
    if (!ALLOWED_RUN_COMMANDS.has(command)) {
      failures.push(`${label}: contains unapproved run command`);
    }
  }
}

function mustContainAllUsesActions(label, actions, requiredActions) {
  const actionSet = new Set(actions);
  for (const action of requiredActions) {
    if (!actionSet.has(action)) {
      failures.push(`${label}: missing exact action ${action}`);
    }
  }
}

function mustOnlyContainAllowedUsesActions(label, actions) {
  for (const action of actions) {
    if (!ALLOWED_USES_ACTIONS.has(action)) {
      failures.push(`${label}: contains unapproved action`);
    }
  }
}

function mustNotContainAny(label, haystack, needles, message) {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      failures.push(message ?? `${label}: unexpectedly contains ${needle}`);
      return;
    }
  }
}

function mustNotContainSensitiveWorkflowMarkers(workflow) {
  if (SENSITIVE_WORKFLOW_KEY_PATTERN.test(workflow)) {
    failures.push("workflow must not reference sensitive environment or credential names");
  }
}

function extractWorkflowRunCommands(workflow) {
  const commands = [];
  const lines = workflow.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^(\s*)(?:-\s*)?run:\s*(.*)$/.exec(line);
    if (!match) continue;

    const runIndent = match[1].length;
    const rawValue = match[2].trim();

    if (rawValue === "|" || rawValue === "|-" || rawValue === ">") {
      index = collectBlockRunCommands(lines, index + 1, runIndent, commands);
      continue;
    }

    if (rawValue.length > 0) {
      commands.push(normalizeRunCommand(rawValue));
    }
  }

  return commands;
}

function extractWorkflowUsesActions(workflow) {
  const actions = [];
  const lines = workflow.split(/\r?\n/);

  for (const line of lines) {
    const match = /^\s*(?:-\s*)?uses:\s*(.*)$/.exec(line);
    if (match && match[1].trim().length > 0) {
      actions.push(normalizeRunCommand(match[1]));
    }
  }

  return actions;
}

function collectBlockRunCommands(lines, startIndex, runIndent, commands) {
  let index = startIndex;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const lineIndent = leadingSpaceCount(line);

    if (trimmed.length > 0 && lineIndent <= runIndent) {
      return index - 1;
    }

    if (trimmed.length > 0) {
      commands.push(normalizeRunCommand(trimmed));
    }
  }

  return index;
}

function leadingSpaceCount(value) {
  const match = /^ */.exec(value);
  return match ? match[0].length : 0;
}

function normalizeRunCommand(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isPathInside(parent, child) {
  const childRelativePath = relative(parent, child);
  return (
    childRelativePath === "" ||
    (childRelativePath.length > 0 &&
      !childRelativePath.startsWith("..") &&
      !isAbsolute(childRelativePath))
  );
}

function redactArgument(value) {
  if (/^https?:\/\//i.test(value)) return "<redacted>";
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

main();
