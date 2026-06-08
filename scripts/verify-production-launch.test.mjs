import assert from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("production launch gate enforces provider write rehearsals before approval safe mode", () => {
  const launchRunbook = readFileSync(
    "docs/deploy/production-launch-runbook.md",
    "utf8",
  );
  const verifierSource = readFileSync(
    "scripts/verify-production-launch.mjs",
    "utf8",
  );

  assertContainsInOrder(
    extractPreflightCommands(launchRunbook),
    [
      "npm run verify:provider-write-dry-run-rehearsal:safe",
      "npm run verify:provider-write-kill-switch-rehearsal:safe",
      "npm run verify:production-provider-write-approval:safe",
      "npm run verify:provider-write-live-pilot-preflight:safe",
    ],
    "launch runbook preflight commands",
  );

  assert.match(
    verifierSource,
    /mustContainInOrder\(\s*"launch runbook provider write approval ordering"/,
  );
  assertContainsInOrder(
    extractVerifierOrderingBlock(verifierSource),
    [
      "npm run verify:provider-write-dry-run-rehearsal:safe",
      "npm run verify:provider-write-kill-switch-rehearsal:safe",
      "npm run verify:production-provider-write-approval:safe",
      "npm run verify:provider-write-live-pilot-preflight:safe",
      "npm run verify:provider-write-safe-ledger-assembly:safe",
      "npm run verify:provider-write-controlled-expansion-approval",
      "npm run verify:provider-write-controlled-expansion-approval:safe",
      "npm run verify:provider-write-controlled-expansion-preflight",
      "npm run verify:provider-write-controlled-expansion-preflight:safe",
    ],
    "production launch verifier source",
  );
});

function assertContainsInOrder(haystack, needles, label) {
  let position = -1;
  for (const needle of needles) {
    const nextPosition = haystack.indexOf(needle, position + 1);
    assert.notStrictEqual(
      nextPosition,
      -1,
      `${label} is missing ${needle}`,
    );
    assert.ok(
      nextPosition > position,
      `${label} must contain ${needles.join(" before ")}`,
    );
    position = nextPosition;
  }
}

function extractPreflightCommands(markdown) {
  const match = markdown.match(/## Preflight Commands[\s\S]*?```bash\n([\s\S]*?)\n```/);
  assert.ok(match, "launch runbook must include a bash preflight command block");
  return match[1];
}

function extractVerifierOrderingBlock(source) {
  const match = source.match(
    /mustContainInOrder\(\s*"launch runbook provider write approval ordering"[\s\S]*?\n\);/,
  );
  assert.ok(match, "production launch verifier must include provider write ordering assertion");
  return match[0];
}
