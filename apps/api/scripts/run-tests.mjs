import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const tsxCli = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const result = spawnSync(
  process.execPath,
  [tsxCli, "--test", "src/**/*.spec.ts"],
  childOptions(),
);

function childOptions() {
  return {
  env: {
    ...process.env,
    TSX_TSCONFIG: "tsconfig.json",
  },
  stdio: "inherit",
  };
}

if (result.error) {
  console.error(`Unable to start API test runner: ${result.error.code ?? result.error.message}`);
}

process.exit(result.status ?? 1);
