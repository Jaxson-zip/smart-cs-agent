import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const args = parseArgs(process.argv.slice(2));

const files = {
  packageJson: "package.json",
  imageSecurityDocs: "docs/deploy/production-image-security.md",
  imageSecurityWorkflow: "docs/deploy/production-image-security.yml.example",
  imageSecurityTest: "scripts/verify-production-image-security.test.mjs",
  imageBuildDocs: "docs/deploy/production-image-builds.md",
  containerSmokeDocs: "docs/deploy/production-container-smoke.md",
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
  runDockerScans();
}

if (failures.length > 0) {
  console.error("Production image security verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production image security verification passed.");
if (args.docker) {
  console.log("- dockerScans=completed");
} else {
  console.log("- dockerScans=skipped");
}

function verifyStaticArtifacts() {
  mustContainAll("package scripts", content.packageJson, [
    "verify:production-image-security",
    "verify:production-image-security:docker",
    "scripts/verify-production-image-security.mjs",
  ]);

  mustContainAll("image security docs", content.imageSecurityDocs, [
    "PR50 Production Image Security Evidence Gate",
    "npm run verify:production-image-security",
    "npm run verify:production-image-security:docker",
    "SBOM",
    "Trivy",
    "Syft",
    "does not publish images",
    "does not read GitHub secrets",
  ]);
  mustNotContainAny("image security docs unsafe", content.imageSecurityDocs, [
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

  mustContainAll("image security workflow", content.imageSecurityWorkflow, [
    "permissions:",
    "contents: read",
    "node-version: 24",
    "npm run verify:production-image-builds:docker",
    "npm run verify:production-container-smoke:docker",
    "npm run verify:production-image-security:docker",
    "actions/upload-artifact@v4",
  ]);
  mustNotContainAny("image security workflow unsafe", content.imageSecurityWorkflow, [
    "docker login",
    "docker push",
    "--push",
    "secrets.",
    "OPERATOR_API_KEYS",
    "REAL_CHANNEL_WEBHOOK_SECRETS",
    "PROVIDER_CREDENTIALS",
    "tenant_1",
  ]);

  mustContainAll("image security tests", content.imageSecurityTest, [
    "production image security verifier passes static checks without Docker",
    "production image security verifier invokes SBOM and vulnerability scans for API and Web images",
    "production image security verifier redacts unknown argument values",
    "production image security verifier rejects unsafe image tags and scanner images without echoing them",
    "assertNoSecretMarkers",
  ]);

  mustContainAll("image build docs reference image security", content.imageBuildDocs, [
    "npm run verify:production-image-security:docker",
    "production-image-security.yml.example",
  ]);
  mustContainAll("container smoke docs reference image security", content.containerSmokeDocs, [
    "npm run verify:production-image-security:docker",
    "production-image-security.yml.example",
  ]);
  mustContainAll("deployment docs reference image security", content.deploymentDocs, [
    "PR50 Production Image Security Evidence Gate",
    "npm run verify:production-image-security",
    "production-image-security.yml.example",
  ]);
  mustContainAll("launch runbook references image security", content.launchRunbook, [
    "npm run verify:production-image-security",
    "npm run verify:production-image-security:docker",
    "docs/deploy/production-image-security.md",
  ]);
  mustContainAll("production readiness references image security", content.productionReadiness, [
    "PR50 Production Image Security Evidence Gate",
    "npm run verify:production-image-security",
    "production-image-security.yml.example",
  ]);
  mustContainAll("production launch verifier references image security", content.productionLaunchVerifier, [
    "verify:production-image-security",
    "production-image-security.md",
    "production-image-security.yml.example",
  ]);
  mustContainAll("task plan references PR50", content.taskPlan, [
    "PR50 - Production Image Security Evidence Gate",
    "verify:production-image-security",
    "production-image-security.yml.example",
  ]);
  mustContainAll("progress references PR50", content.progress, [
    "Started PR50 production image security evidence gate",
    "verify:production-image-security",
  ]);
}

function runDockerScans() {
  const dockerCommand = readDockerCommand();
  mkdirSync(args.artifactsDir, { recursive: true });

  const commands = [
    {
      label: "api SBOM scan",
      args: syftArgs(args.apiTag, "api.sbom.spdx.json"),
    },
    {
      label: "web SBOM scan",
      args: syftArgs(args.webTag, "web.sbom.spdx.json"),
    },
    {
      label: "api vulnerability scan",
      args: trivyArgs(args.apiTag, "api.trivy.json"),
    },
    {
      label: "web vulnerability scan",
      args: trivyArgs(args.webTag, "web.trivy.json"),
    },
  ];

  for (const command of commands) {
    runDockerCommand(dockerCommand, command.label, command.args);
  }

  if (
    failures.length === 0 &&
    process.env.SMARTCS_IMAGE_SECURITY_SKIP_ARTIFACTS !== "true"
  ) {
    verifyGeneratedArtifacts();
  }
}

function syftArgs(imageTag, outputFile) {
  return [
    "run",
    "--rm",
    "--volume",
    "/var/run/docker.sock:/var/run/docker.sock",
    "--volume",
    `${toDockerPath(args.artifactsDir)}:/artifacts`,
    args.syftImage,
    imageTag,
    "-o",
    `spdx-json=/artifacts/${outputFile}`,
  ];
}

function trivyArgs(imageTag, outputFile) {
  return [
    "run",
    "--rm",
    "--volume",
    "/var/run/docker.sock:/var/run/docker.sock",
    "--volume",
    `${toDockerPath(args.artifactsDir)}:/artifacts`,
    args.trivyImage,
    "image",
    "--exit-code",
    "1",
    "--severity",
    args.severity,
    "--ignore-unfixed",
    "--format",
    "json",
    "--output",
    `/artifacts/${outputFile}`,
    imageTag,
  ];
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

function verifyGeneratedArtifacts() {
  for (const fileName of [
    "api.sbom.spdx.json",
    "web.sbom.spdx.json",
    "api.trivy.json",
    "web.trivy.json",
  ]) {
    const filePath = join(args.artifactsDir, fileName);
    if (!existsSync(filePath)) {
      failures.push(`${fileName} was not generated`);
      continue;
    }
    assertArtifactDoesNotLeak(filePath, fileName);
  }
}

function assertArtifactDoesNotLeak(filePath, label) {
  const value = readFileSync(filePath, "utf8");
  mustNotContainAny(label, value, [
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
    "dev_operator_key",
    "tenant_1",
    "actual_provider_token",
    "plain_secret_token",
  ]);
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
    apiTag: "smart-cs-agent-api:verify",
    artifactsDir: join(tmpdir(), "smart-cs-agent-image-security"),
    docker: false,
    severity: "HIGH,CRITICAL",
    syftImage: "anchore/syft:latest",
    trivyImage: "aquasec/trivy:latest",
    webTag: "smart-cs-agent-web:verify",
  };

  for (const value of values) {
    if (value === "--docker") {
      parsed.docker = true;
    } else if (value.startsWith("--api-tag=")) {
      parsed.apiTag = readSafeTag(value.slice("--api-tag=".length), "--api-tag");
    } else if (value.startsWith("--web-tag=")) {
      parsed.webTag = readSafeTag(value.slice("--web-tag=".length), "--web-tag");
    } else if (value.startsWith("--artifacts-dir=")) {
      parsed.artifactsDir = readSafeArtifactsDir(
        value.slice("--artifacts-dir=".length),
      );
    } else if (value.startsWith("--syft-image=")) {
      parsed.syftImage = readSafeScannerImage(
        value.slice("--syft-image=".length),
        "--syft-image",
        parsed.syftImage,
      );
    } else if (value.startsWith("--trivy-image=")) {
      parsed.trivyImage = readSafeScannerImage(
        value.slice("--trivy-image=".length),
        "--trivy-image",
        parsed.trivyImage,
      );
    } else if (value.startsWith("--severity=")) {
      parsed.severity = readSafeSeverity(
        value.slice("--severity=".length),
        parsed.severity,
      );
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

function readSafeScannerImage(value, label, fallback) {
  if (
    /^[A-Za-z0-9._/-]+(?::[A-Za-z0-9._-]+|@sha256:[a-fA-F0-9]{64})$/.test(
      value,
    )
  ) {
    return value;
  }
  failures.push(`${label} must be a safe scanner image reference`);
  return fallback;
}

function readSafeArtifactsDir(value) {
  if (
    value.trim() &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value)
  ) {
    return isAbsolute(value) ? value : resolve(repoRoot, value);
  }
  failures.push("--artifacts-dir must be a safe local path");
  return join(tmpdir(), "smart-cs-agent-image-security");
}

function readSafeSeverity(value, fallback) {
  if (/^(UNKNOWN|LOW|MEDIUM|HIGH|CRITICAL)(,(UNKNOWN|LOW|MEDIUM|HIGH|CRITICAL))*$/.test(value)) {
    return value;
  }
  failures.push("--severity must be a comma-separated Trivy severity list");
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

function toDockerPath(value) {
  return value.replace(/\\/g, "/");
}

function redactArgument(value) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}
