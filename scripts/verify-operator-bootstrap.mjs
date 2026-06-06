import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const scriptPath = "scripts/bootstrap-operator-admin.mjs";

if (!existsSync(scriptPath)) {
  fail(`${scriptPath} is missing`);
}

const result = spawnSync(
  process.execPath,
  [
    scriptPath,
    "--dry-run",
    "--username=launch_admin",
    "--password=do_not_print_this_password",
    "--tenant=tenant_1",
    "--operator-id=admin_1",
    "--api-key=do_not_print_this_api_key_123456",
  ],
  {
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  fail(`dry-run failed: ${result.stderr || result.stdout}`);
}

const output = `${result.stdout}\n${result.stderr}`;
for (const expected of [
  '"dryRun": true',
  '"username": "launch_admin"',
  '"tenantId": "tenant_1"',
  '"operatorId": "admin_1"',
  '"role": "admin"',
]) {
  if (!output.includes(expected)) {
    fail(`dry-run output is missing ${expected}`);
  }
}

for (const forbidden of [
  "do_not_print_this_password",
  "do_not_print_this_api_key_123456",
  "passwordHash",
  "apiKey",
]) {
  if (output.includes(forbidden)) {
    fail("dry-run output leaked a forbidden secret marker");
  }
}

const envSecretResult = spawnSync(
  process.execPath,
  [
    scriptPath,
    "--dry-run",
    "--username=env_launch_admin",
    "--tenant=tenant_1",
    "--operator-id=admin_2",
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      OPERATOR_BOOTSTRAP_PASSWORD: "do_not_print_env_password",
      OPERATOR_BOOTSTRAP_API_KEY: "do_not_print_env_api_key_123456",
    },
  },
);

if (envSecretResult.status !== 0) {
  fail(`env-secret dry-run failed: ${envSecretResult.stderr || envSecretResult.stdout}`);
}

const envOutput = `${envSecretResult.stdout}\n${envSecretResult.stderr}`;
for (const expected of [
  '"dryRun": true',
  '"username": "env_launch_admin"',
  '"tenantId": "tenant_1"',
  '"operatorId": "admin_2"',
]) {
  if (!envOutput.includes(expected)) {
    fail(`env-secret dry-run output is missing ${expected}`);
  }
}

for (const forbidden of [
  "do_not_print_env_password",
  "do_not_print_env_api_key_123456",
  "passwordHash",
  "apiKey",
]) {
  if (envOutput.includes(forbidden)) {
    fail("env-secret dry-run output leaked a forbidden secret marker");
  }
}

console.log("Operator bootstrap verification passed.");

function fail(message) {
  console.error(`Operator bootstrap verification failed: ${message}`);
  process.exit(1);
}
