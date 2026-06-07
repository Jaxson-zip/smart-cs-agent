import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.SMARTCS_PROVIDER_WRITE_PAYLOAD_ESCROW_REPO_ROOT
  ? resolve(process.env.SMARTCS_PROVIDER_WRITE_PAYLOAD_ESCROW_REPO_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  envExample: ".env.example",
  prismaSchema: "prisma/schema.prisma",
  pr61AttemptConstraints:
    "prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql",
  pr62Migration:
    "prisma/migrations/20260608013000_pr62_provider_write_payload_escrow_boundary/migration.sql",
  pr62CrossFieldMigration:
    "prisma/migrations/20260608013500_pr62_provider_write_payload_escrow_cross_field_constraints/migration.sql",
  apiConfig: "apps/api/src/config/api-config.ts",
  apiConfigSpec: "apps/api/src/config/api-config.spec.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  webProviderWriteRequests:
    "apps/web/src/app/api/operator/provider-writes/requests/route.ts",
  providerWriteDocs: "docs/deploy/provider-write-requests.md",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  staticCiWorkflow: ".github/workflows/production-static-gates.yml",
  staticCiVerifier: "scripts/verify-production-static-ci.mjs",
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

const requestSchemaSlice = sliceBetween(
  content.prismaSchema,
  "model ProviderWriteRequest",
  "model ProviderWriteExecutionAttempt",
);
const executionAttemptSchemaSlice = sliceBetween(
  content.prismaSchema,
  "model ProviderWriteExecutionAttempt",
  "model CaseMessage",
);
const executionBoundarySlice = [
  sliceBetween(
    content.opsService,
    "async executeProviderWriteAttempt",
    "private async findProviderReadRun",
  ),
  sliceBetween(
    content.opsService,
    "private async persistProviderWriteExecutionAttempt",
    "private async providerReadCaseBelongsToTenant",
  ),
  sliceBetween(
    content.opsService,
    "function providerWriteExecutionAttemptMetadata",
    "function providerReadResponseFromRun",
  ),
].join("\n");
const escrowHelperSlice = sliceBetween(
  content.opsService,
  "function providerWritePayloadEscrowFingerprint(",
  "function providerWriteReviewFingerprint",
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-payload-escrow-boundary",
  "scripts/verify-provider-write-payload-escrow-boundary.mjs",
]);

mustContainAll("env example", content.envExample, [
  "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE=disabled",
]);

mustContainAll("api config escrow mode", content.apiConfig, [
  "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE",
  "providerWritePayloadEscrowMode",
  "disabled",
  "sealed_metadata",
]);

mustContainAll("api config tests", content.apiConfigSpec, [
  "keeps provider write payload escrow disabled unless explicitly configured",
  "rejects invalid provider write payload escrow configuration",
  "sealed_metadata",
]);

mustContainAll("provider write request schema escrow metadata", requestSchemaSlice, [
  "payloadEscrowStatus",
  "payloadEscrowFingerprint",
  "payloadEscrowEnvelopeFingerprint",
  "payloadEscrowMode",
  "payloadEscrowCreatedAt",
]);
mustNotContainAny("provider write request schema unsafe fields", requestSchemaSlice, [
  "rawProviderPayload",
  "providerPayload",
  "providerResponse",
  "rawPayload",
  "rawOrderId",
  "rawAddress",
  "ciphertext",
  "credentialRef",
  "accessToken",
  "refreshToken",
  "operatorApiKey",
  "customerMessage",
]);

mustContainAll("provider write request escrow migration", content.pr62Migration, [
  'ALTER TABLE "ProviderWriteRequest"',
  '"payloadEscrowEnvelopeFingerprint" TEXT',
  '"payloadEscrowMode" TEXT NOT NULL DEFAULT \'disabled\'',
  '"payloadEscrowCreatedAt" TIMESTAMP(3)',
  'CONSTRAINT "ProviderWriteRequest_payload_escrow_status_chk"',
  '"payloadEscrowStatus" IN (\'not_stored\', \'sealed_metadata\')',
  'CONSTRAINT "ProviderWriteRequest_payload_escrow_mode_chk"',
  '"payloadEscrowMode" IN (\'disabled\', \'sealed_metadata\')',
]);
mustNotContainAnyInsensitive("provider write request escrow migration unsafe fields", content.pr62Migration, [
  "DROP TABLE",
  "CASCADE",
  "providerPayload",
  "providerResponse",
  "rawPayload",
  "ciphertext",
  "credentialRef",
  "accessToken",
  "operatorApiKey",
  "secret",
  "token",
]);
mustContainAll("provider write request escrow consistency migration", content.pr62CrossFieldMigration, [
  'ALTER TABLE "ProviderWriteRequest"',
  'CONSTRAINT "ProviderWriteRequest_payload_escrow_consistency_chk"',
  '"payloadEscrowStatus" = \'not_stored\'',
  '"payloadEscrowMode" = \'disabled\'',
  '"payloadEscrowEnvelopeFingerprint" IS NULL',
  '"payloadEscrowCreatedAt" IS NULL',
  '"payloadEscrowStatus" = \'sealed_metadata\'',
  '"payloadEscrowMode" = \'sealed_metadata\'',
  '"payloadEscrowFingerprint" IS NOT NULL',
  '"payloadEscrowEnvelopeFingerprint" IS NOT NULL',
  '"payloadEscrowCreatedAt" IS NOT NULL',
]);
mustNotContainAnyInsensitive(
  "provider write request escrow consistency migration unsafe fields",
  content.pr62CrossFieldMigration,
  [
    "DROP TABLE",
    "CASCADE",
    "providerPayload",
    "providerResponse",
    "rawPayload",
    "ciphertext",
    "credentialRef",
    "accessToken",
    "operatorApiKey",
    "secret",
    "token",
  ],
);

mustContainAll("execution attempt constraints", content.pr61AttemptConstraints, [
  '"payloadEscrowStatus" = \'not_stored\'',
  '"payloadEscrowOpened" = false',
  '"networkExecution" = \'not_started\'',
  '"providerMutationExecuted" = false',
  '"customerVisibleMessageSent" = false',
]);
mustContainAll("execution attempt schema remains no escrow open", executionAttemptSchemaSlice, [
  "payloadEscrowStatus        String   @default(\"not_stored\")",
  "payloadEscrowOpened        Boolean  @default(false)",
]);
mustNotContainAny("execution attempt schema unsafe fields", executionAttemptSchemaSlice, [
  "payloadEscrowEnvelopeFingerprint",
  "providerPayload",
  "providerResponse",
  "ciphertext",
  "credentialRef",
  "accessToken",
  "operatorApiKey",
]);

mustContainAll("ops service escrow metadata", content.opsService, [
  "providerWritePayloadEscrowMode",
  "providerWritePayloadEscrowMetadata",
  "providerWriteReviewPayloadEscrowFields",
  "provider_write_payload_escrow_sealed_metadata",
  "provider_write_payload_escrow_envelope_metadata",
  "payloadEscrowEnvelopeFingerprint",
  "payloadEscrowStatus: \"sealed_metadata\"",
  "payloadEscrowMode: \"sealed_metadata\"",
  "payloadEscrowStatus: \"not_stored\"",
]);
mustContainAll("ops service attempt remains constrained", content.opsService, [
  "payloadEscrowStatus: \"not_stored\"",
  "payloadEscrowOpened: false",
  "networkExecution: \"not_started\"",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
  "unsupported_payload_escrow_state",
]);
mustNotMatchAny("escrow helper no raw payload storage", escrowHelperSlice, [
  /request\.payload(?!Escrow)/,
]);
mustNotContainAny("escrow helper no raw payload storage", escrowHelperSlice, [
  "orderId",
  "logisticsId",
  "addressFingerprint",
  "couponAmountCents",
  "credentialResolver",
  "decrypt",
  "secret://",
  "vault://",
]);
mustNotContainAny("execution boundary no provider writes", executionBoundarySlice, [
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
  "payloadEscrowOpened: true",
  "credentialResolver",
  "loadProviderCredentialRefs",
  "decrypt",
  "secret://",
  "vault://",
]);

mustContainAll("ops service escrow tests", content.opsServiceSpec, [
  "keeps provider write payload escrow disabled by default",
  "records sealed metadata fingerprints without raw provider write payloads",
  "preserves sealed payload escrow metadata through human review",
  "blocks sealed escrow execution attempts without opening escrow or violating attempt invariants",
  "writeCallCount, 0",
  "payloadEscrowStatus",
  "payloadEscrowEnvelopeFingerprint",
]);

mustContainAll("web provider write request BFF", content.webProviderWriteRequests, [
  "readProviderWritePayloadEscrowStatus",
  "sealed_metadata",
  "not_stored",
]);

mustContainAll("provider write docs", content.providerWriteDocs, [
  "PR62 Provider Write Payload Escrow Boundary",
  "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE",
  "sealed_metadata",
  "payloadEscrowEnvelopeFingerprint",
  "does not open payload escrow",
  "does not execute provider writes",
  "npm run verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("provider adapter docs", content.providerDocs, [
  "PR62 Provider Write Payload Escrow Boundary",
  "verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("production readiness docs", content.productionReadiness, [
  "PR62 Provider Write Payload Escrow Boundary",
  "verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("public API surface docs", content.publicApiSurface, [
  "Provider write payload escrow boundary",
  "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE",
  "payloadEscrowStatus",
  "payloadEscrowOpened=false",
]);
mustContainAll("launch runbook docs", content.launchRunbook, [
  "verify:provider-write-payload-escrow-boundary",
  "Provider write payload escrow boundary",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs",
  "npm run verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs",
  "npm run verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify-provider-write-payload-escrow-boundary.mjs",
  "verify:provider-write-payload-escrow-boundary",
  "provider write payload escrow boundary",
]);
mustContainAll("task plan references", content.taskPlan, [
  "PR62 - Provider Write Payload Escrow Boundary",
  "verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("progress references", content.progress, [
  "Started PR62 provider write payload escrow boundary",
]);

if (failures.length > 0) {
  console.error("Provider write payload escrow boundary verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write payload escrow boundary verification passed.");

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

function mustNotContainAnyInsensitive(label, haystack, needles) {
  const lowerHaystack = haystack.toLowerCase();
  for (const needle of needles) {
    if (lowerHaystack.includes(needle.toLowerCase())) {
      failures.push(`${label}: unexpectedly contains ${needle}`);
    }
  }
}

function mustNotMatchAny(label, haystack, patterns) {
  for (const pattern of patterns) {
    if (pattern.test(haystack)) {
      failures.push(`${label}: unexpectedly matches ${pattern}`);
    }
  }
}

function sliceBetween(haystack, startNeedle, endNeedle) {
  const start = haystack.indexOf(startNeedle);
  if (start === -1) {
    failures.push(`slice: missing ${startNeedle}`);
    return "";
  }
  const end = haystack.indexOf(endNeedle, start + startNeedle.length);
  if (end === -1) {
    failures.push(`slice: missing ${endNeedle}`);
    return haystack.slice(start);
  }
  return haystack.slice(start, end);
}
