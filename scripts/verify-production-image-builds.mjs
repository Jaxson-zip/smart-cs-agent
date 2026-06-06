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
  imageBuildDocs: "docs/deploy/production-image-builds.md",
  imageBuildWorkflow: "docs/deploy/production-image-build.yml.example",
  imageBuildTest: "scripts/verify-production-image-builds.test.mjs",
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
  runDockerBuilds();
}

if (failures.length > 0) {
  console.error("Production image build verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production image build verification passed.");
if (args.docker) {
  console.log("- dockerBuilds=completed");
} else {
  console.log("- dockerBuilds=skipped");
}

function verifyStaticArtifacts() {
  mustContainAll("package scripts", content.packageJson, [
    "verify:production-image-builds",
    "verify:production-image-builds:docker",
    "scripts/verify-production-image-builds.mjs",
  ]);

  mustContainAll("api dockerfile build target", content.apiDockerfile, [
    "FROM node:24-bookworm-slim AS deps",
    "npm ci",
    "npm run build --workspace @smart-cs-agent/api",
    'CMD ["node", "apps/api/dist/main.js"]',
  ]);
  mustContainAll("web dockerfile build target", content.webDockerfile, [
    "FROM node:24-bookworm-slim AS deps",
    "npm ci",
    "npm run build --workspace @smart-cs-agent/web",
    'CMD ["node", "apps/web/server.js"]',
  ]);

  mustContainAll("image build docs", content.imageBuildDocs, [
    "PR48 Production Image Build Gate",
    "npm run verify:production-image-builds",
    "npm run verify:production-image-builds:docker",
    "apps/api/Dockerfile",
    "apps/web/Dockerfile",
    "does not publish images",
  ]);
  mustNotContainAny("image build docs unsafe", content.imageBuildDocs, [
    "docker login",
    "--push",
    "secrets.",
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
    "dev_operator_key",
    "tenant_1",
  ]);

  mustContainAll("image build workflow", content.imageBuildWorkflow, [
    "permissions:",
    "contents: read",
    "node-version: 24",
    "npm run verify:production-deploy-artifacts",
    "npm run verify:production-image-builds:docker",
  ]);
  mustNotContainAny("image build workflow unsafe", content.imageBuildWorkflow, [
    "docker login",
    "--push",
    "secrets.",
    "OPERATOR_API_KEYS",
    "REAL_CHANNEL_WEBHOOK_SECRETS",
    "PROVIDER_CREDENTIALS",
    "tenant_1",
  ]);

  mustContainAll("image build tests", content.imageBuildTest, [
    "production image build verifier passes static checks without Docker",
    "production image build verifier invokes API and Web Docker builds",
    "production image build verifier redacts unknown argument values",
    "production image build verifier rejects unsafe image tags without echoing them",
    "assertNoSecretMarkers",
  ]);

  mustContainAll("deployment docs references image builds", content.deploymentDocs, [
    "PR48 Production Image Build Gate",
    "npm run verify:production-image-builds",
    "production-image-build.yml.example",
  ]);
  mustContainAll("launch runbook references image builds", content.launchRunbook, [
    "npm run verify:production-image-builds",
    "npm run verify:production-image-builds:docker",
    "docs/deploy/production-image-builds.md",
  ]);
  mustContainAll("production readiness references image builds", content.productionReadiness, [
    "PR48 Production Image Build Gate",
    "npm run verify:production-image-builds",
    "production-image-build.yml.example",
  ]);
  mustContainAll("production launch verifier references image builds", content.productionLaunchVerifier, [
    "verify:production-image-builds",
    "production-image-builds.md",
    "production-image-build.yml.example",
  ]);
  mustContainAll("task plan references PR48", content.taskPlan, [
    "PR48 - Production Image Build Gate",
    "verify:production-image-builds",
    "production-image-build.yml.example",
  ]);
  mustContainAll("progress references PR48", content.progress, [
    "Started PR48 production image build gate",
    "verify:production-image-builds",
  ]);
}

function runDockerBuilds() {
  const dockerCommand = readDockerCommand();
  const buildCommands = [
    {
      label: "api",
      args: [
        "build",
        "--pull=false",
        "--file",
        "apps/api/Dockerfile",
        "--tag",
        args.apiTag,
        ".",
      ],
    },
    {
      label: "web",
      args: [
        "build",
        "--pull=false",
        "--file",
        "apps/web/Dockerfile",
        "--tag",
        args.webTag,
        ".",
      ],
    },
  ];

  for (const command of buildCommands) {
    console.log(`Building ${command.label} production image.`);
    const result = spawnSync(dockerCommand.bin, command.args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: dockerCommand.shell,
      env: {
        PATH: process.env.PATH,
        Path: process.env.Path,
      },
    });

    if (result.error) {
      failures.push(`${command.label} docker build failed to start`);
      continue;
    }
    if (result.status !== 0) {
      failures.push(`${command.label} docker build failed`);
    }
  }
}

function readDockerCommand() {
  const bin = process.env.SMARTCS_DOCKER_BIN || "docker";
  return {
    bin,
    shell: process.platform === "win32" && /\.(bat|cmd)$/i.test(bin),
  };
}

function parseArgs(values) {
  const parsed = {
    apiTag: "smart-cs-agent-api:verify",
    docker: false,
    webTag: "smart-cs-agent-web:verify",
  };

  for (const value of values) {
    if (value === "--docker") {
      parsed.docker = true;
    } else if (value.startsWith("--api-tag=")) {
      parsed.apiTag = readSafeTag(value.slice("--api-tag=".length), "--api-tag");
    } else if (value.startsWith("--web-tag=")) {
      parsed.webTag = readSafeTag(value.slice("--web-tag=".length), "--web-tag");
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
