import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const args = parseArgs(process.argv.slice(2));

const files = {
  packageJson: "package.json",
  apiDockerfile: "apps/api/Dockerfile",
  webDockerfile: "apps/web/Dockerfile",
  containerSmokeDocs: "docs/deploy/production-container-smoke.md",
  containerSmokeWorkflow: "docs/deploy/production-container-smoke.yml.example",
  containerSmokeTest: "scripts/verify-production-container-smoke.test.mjs",
  imageBuildDocs: "docs/deploy/production-image-builds.md",
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

verifyStaticArtifacts();

if (args.docker && failures.length === 0) {
  await runDockerSmoke();
}

if (failures.length > 0) {
  console.error("Production container smoke verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production container smoke verification passed.");
if (args.docker) {
  console.log("- dockerSmoke=completed");
} else {
  console.log("- dockerSmoke=skipped");
}

function verifyStaticArtifacts() {
  mustContainAll("package scripts", content.packageJson, [
    "verify:production-container-smoke",
    "verify:production-container-smoke:docker",
    "scripts/verify-production-container-smoke.mjs",
  ]);

  mustContainAll("api dockerfile runtime", content.apiDockerfile, [
    "NODE_ENV=production",
    "WECOM_SANDBOX_ENABLED=false",
    "ENABLE_LEGACY_WEB_DEMO_API=false",
    "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false",
    "USER node",
    "HEALTHCHECK",
    "/health",
    'CMD ["node", "apps/api/dist/main.js"]',
  ]);
  mustContainAll("web dockerfile runtime", content.webDockerfile, [
    "NODE_ENV=production",
    "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false",
    "ENABLE_LEGACY_WEB_DEMO_API=false",
    "HOSTNAME=0.0.0.0",
    "USER node",
    "HEALTHCHECK",
    "/api/operator/readiness",
    'CMD ["node", "apps/web/server.js"]',
  ]);

  mustContainAll("container smoke docs", content.containerSmokeDocs, [
    "PR49 Production Container Runtime Smoke Gate",
    "npm run verify:production-container-smoke",
    "npm run verify:production-container-smoke:docker",
    "GET /health",
    "GET /",
    "does not publish images",
    "does not call real channel webhooks",
  ]);
  mustNotContainAny("container smoke docs unsafe", content.containerSmokeDocs, [
    "docker login",
    "docker push",
    "--push",
    "secrets.",
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
    "dev_operator_key",
    "tenant_1",
    "WECOM_SANDBOX_ENABLED=true",
    "ENABLE_LEGACY_WEB_DEMO_API=true",
    "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=true",
    "ALLOW_INSECURE_OPERATOR_HEADERS=true",
  ]);

  mustContainAll("container smoke workflow", content.containerSmokeWorkflow, [
    "permissions:",
    "contents: read",
    "node-version: 24",
    "npm run verify:production-image-builds:docker",
    "npm run verify:production-container-smoke:docker",
  ]);
  mustNotContainAny("container smoke workflow unsafe", content.containerSmokeWorkflow, [
    "docker login",
    "docker push",
    "--push",
    "secrets.",
    "OPERATOR_API_KEYS",
    "REAL_CHANNEL_WEBHOOK_SECRETS",
    "PROVIDER_CREDENTIALS",
    "tenant_1",
  ]);

  mustContainAll("container smoke tests", content.containerSmokeTest, [
    "production container smoke verifier passes static checks without Docker",
    "production container smoke verifier starts API and Web smoke containers",
    "production container smoke verifier redacts unknown argument values",
    "production container smoke verifier rejects unsafe image tags without echoing them",
    "assertNoSecretMarkers",
  ]);

  mustContainAll("image build docs reference runtime smoke", content.imageBuildDocs, [
    "npm run verify:production-container-smoke:docker",
    "production-container-smoke.yml.example",
  ]);
  mustContainAll("deployment docs reference runtime smoke", content.deploymentDocs, [
    "PR49 Production Container Runtime Smoke Gate",
    "npm run verify:production-container-smoke",
    "production-container-smoke.yml.example",
  ]);
  mustContainAll("launch runbook references runtime smoke", content.launchRunbook, [
    "npm run verify:production-container-smoke",
    "npm run verify:production-container-smoke:docker",
    "docs/deploy/production-container-smoke.md",
  ]);
  mustContainAll("production readiness references runtime smoke", content.productionReadiness, [
    "PR49 Production Container Runtime Smoke Gate",
    "npm run verify:production-container-smoke",
    "production-container-smoke.yml.example",
  ]);
  mustContainAll("production launch verifier references runtime smoke", content.productionLaunchVerifier, [
    "verify:production-container-smoke",
    "production-container-smoke.md",
    "production-container-smoke.yml.example",
  ]);
  mustContainAll("task plan references PR49", content.taskPlan, [
    "PR49 - Production Container Runtime Smoke Gate",
    "verify:production-container-smoke",
    "production-container-smoke.yml.example",
  ]);
  mustContainAll("progress references PR49", content.progress, [
    "Started PR49 production container runtime smoke gate",
    "verify:production-container-smoke",
  ]);
}

async function runDockerSmoke() {
  const dockerCommand = readDockerCommand();
  const suffix = `${process.pid}-${Date.now()}`;
  const networkName = `smartcs-smoke-${suffix}`;
  const postgresName = `smartcs-smoke-postgres-${suffix}`;
  const apiName = `smartcs-smoke-api-${suffix}`;
  const webName = `smartcs-smoke-web-${suffix}`;

  try {
    runDockerCommand(dockerCommand, "create smoke network", [
      "network",
      "create",
      networkName,
    ]);
    runDockerCommand(dockerCommand, "start smoke database", [
      "run",
      "--detach",
      "--rm",
      "--name",
      postgresName,
      "--network",
      networkName,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env",
      "POSTGRES_USER=smartcs_smoke",
      "--env",
      "POSTGRES_DB=smartcs_smoke",
      "postgres:16",
    ]);
    runDockerCommand(dockerCommand, "start API smoke container", [
      "run",
      "--detach",
      "--rm",
      "--name",
      apiName,
      "--network",
      networkName,
      "--publish",
      `127.0.0.1:${args.apiPort}:4100`,
      "--env",
      "NODE_ENV=production",
      "--env",
      "PORT=4100",
      "--env",
      `DATABASE_URL=postgresql://smartcs_smoke@${postgresName}:5432/smartcs_smoke`,
      "--env",
      `WEB_ORIGIN=http://127.0.0.1:${args.webPort}`,
      "--env",
      "WECOM_SANDBOX_ENABLED=false",
      "--env",
      "ENABLE_LEGACY_WEB_DEMO_API=false",
      "--env",
      "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false",
      "--env",
      "ALLOW_INSECURE_OPERATOR_HEADERS=false",
      "--env",
      "SMART_CS_LOAD_DOTENV=false",
      "--env",
      "REAL_CHANNEL_WEBHOOKS_ENABLED=false",
      "--env",
      "REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true",
      "--env",
      "REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS=300",
      "--env",
      "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE=1",
      "--env",
      "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD=1000",
      "--env",
      "CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS=3600",
      "--env",
      "CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD=1",
      "--env",
      "CHANNEL_QUEUE_STALE_AFTER_MINUTES=15",
      args.apiTag,
    ]);
    runDockerCommand(dockerCommand, "start Web smoke container", [
      "run",
      "--detach",
      "--rm",
      "--name",
      webName,
      "--network",
      networkName,
      "--publish",
      `127.0.0.1:${args.webPort}:3000`,
      "--env",
      "NODE_ENV=production",
      "--env",
      "PORT=3000",
      "--env",
      `API_URL=http://${apiName}:4100`,
      "--env",
      `NEXT_PUBLIC_API_URL=http://127.0.0.1:${args.apiPort}`,
      "--env",
      `NEXT_PUBLIC_WS_URL=ws://127.0.0.1:${args.apiPort}`,
      "--env",
      "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false",
      "--env",
      "ENABLE_LEGACY_WEB_DEMO_API=false",
      "--env",
      "OPERATOR_IDENTITY_PROVIDER=database",
      "--env",
      "OPERATOR_ACCOUNT_SOURCE=database",
      args.webTag,
    ]);

    if (
      failures.length === 0 &&
      process.env.SMARTCS_CONTAINER_SMOKE_SKIP_HTTP !== "true"
    ) {
      await waitForHttp(`http://127.0.0.1:${args.apiPort}/health`, "api");
      await waitForHttp(`http://127.0.0.1:${args.webPort}/`, "web");
    }
  } finally {
    runDockerCleanup(dockerCommand, ["rm", "-f", webName]);
    runDockerCleanup(dockerCommand, ["rm", "-f", apiName]);
    runDockerCleanup(dockerCommand, ["rm", "-f", postgresName]);
    runDockerCleanup(dockerCommand, ["network", "rm", networkName]);
  }
}

function runDockerCommand(dockerCommand, label, commandArgs) {
  const result = spawnSync(dockerCommand.bin, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: dockerCommand.shell,
    env: dockerEnv(),
  });

  if (result.error || result.status !== 0) {
    failures.push(`${label} failed`);
  }
}

function runDockerCleanup(dockerCommand, commandArgs) {
  spawnSync(dockerCommand.bin, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: dockerCommand.shell,
    env: dockerEnv(),
  });
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Retry until timeout; failure output intentionally avoids response bodies.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  failures.push(`${label} HTTP smoke check failed`);
}

function readDockerCommand() {
  const bin = process.env.SMARTCS_DOCKER_BIN || "docker";
  return {
    bin,
    shell: process.platform === "win32" && /\.(bat|cmd)$/i.test(bin),
  };
}

function dockerEnv() {
  return {
    PATH: process.env.PATH,
    Path: process.env.Path,
    DOCKER_CONTEXT: process.env.DOCKER_CONTEXT,
    DOCKER_HOST: process.env.DOCKER_HOST,
  };
}

function parseArgs(values) {
  const parsed = {
    apiPort: 45101,
    apiTag: "smart-cs-agent-api:verify",
    docker: false,
    timeoutMs: 30_000,
    webPort: 45102,
    webTag: "smart-cs-agent-web:verify",
  };

  for (const value of values) {
    if (value === "--docker") {
      parsed.docker = true;
    } else if (value.startsWith("--api-tag=")) {
      parsed.apiTag = readSafeTag(value.slice("--api-tag=".length), "--api-tag");
    } else if (value.startsWith("--web-tag=")) {
      parsed.webTag = readSafeTag(value.slice("--web-tag=".length), "--web-tag");
    } else if (value.startsWith("--api-port=")) {
      parsed.apiPort = readSafePort(value.slice("--api-port=".length), "--api-port", parsed.apiPort);
    } else if (value.startsWith("--web-port=")) {
      parsed.webPort = readSafePort(value.slice("--web-port=".length), "--web-port", parsed.webPort);
    } else if (value.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = readSafeTimeout(value.slice("--timeout-ms=".length), parsed.timeoutMs);
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function readSafeTag(value, label) {
  if (/^[A-Za-z0-9._/-]+:[A-Za-z0-9._-]+$/.test(value)) {
    return value;
  }
  failures.push(`${label} must be a safe local image tag`);
  return label === "--api-tag"
    ? "smart-cs-agent-api:verify"
    : "smart-cs-agent-web:verify";
}

function readSafePort(value, label, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535) {
    return parsed;
  }
  failures.push(`${label} must be a local TCP port between 1024 and 65535`);
  return fallback;
}

function readSafeTimeout(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1000 && parsed <= 120_000) {
    return parsed;
  }
  failures.push("--timeout-ms must be between 1000 and 120000");
  return fallback;
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

function redactArgument(value) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}
