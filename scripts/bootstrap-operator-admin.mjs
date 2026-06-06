import { randomBytes, scryptSync } from "node:crypto";

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run");

try {
  const input = readInput(args);
  const passwordHash = createPasswordHash(input.password);

  if (dryRun) {
    printResult({ dryRun: true, created: false, ...publicAccount(input) });
    process.exit(0);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.operatorAccount.create({
        data: {
          username: input.username,
          tenantId: input.tenantId,
          operatorId: input.operatorId,
          role: "admin",
          passwordHash,
          apiKey: input.apiKey,
        },
      });
      await tx.auditLog.create({
        data: {
          caseId: null,
          action: "operator_account.bootstrap_admin_created",
          details: {
            username: input.username,
            tenantId: input.tenantId,
            operatorId: input.operatorId,
            role: "admin",
          },
        },
      });
    });
  } finally {
    await prisma.$disconnect();
  }

  printResult({ dryRun: false, created: true, ...publicAccount(input) });
} catch (error) {
  if (isPrismaUniqueConflict(error)) {
    fail("Operator admin already exists for this username or tenant/operator pair");
  }
  fail(error instanceof Error ? error.message : "Unable to bootstrap operator admin");
}

function parseArgs(values) {
  const parsed = new Map();
  for (const value of values) {
    if (value === "--dry-run") {
      parsed.set("dry-run", "true");
      continue;
    }
    if (!value.startsWith("--") || !value.includes("=")) {
      fail(`Unknown argument: ${redactArgument(value)}`);
    }
    const separatorIndex = value.indexOf("=");
    parsed.set(value.slice(2, separatorIndex), value.slice(separatorIndex + 1));
  }
  return parsed;
}

function readInput(values) {
  const input = {
    username: required(values, "username"),
    password: requiredSecret(
      values,
      "password",
      "OPERATOR_BOOTSTRAP_PASSWORD",
    ),
    tenantId: required(values, "tenant"),
    operatorId: required(values, "operator-id"),
    apiKey: requiredSecret(values, "api-key", "OPERATOR_BOOTSTRAP_API_KEY"),
  };

  assertBoundaryId(input.username, "username");
  assertBoundaryId(input.tenantId, "tenant");
  assertBoundaryId(input.operatorId, "operator-id");
  if (input.password.length < 10) {
    throw new Error("password must be at least 10 characters");
  }
  if (input.apiKey.length < 24) {
    throw new Error("api-key must be at least 24 characters");
  }

  return input;
}

function required(values, key) {
  const value = values.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function requiredSecret(values, key, envKey) {
  const value = values.get(key) ?? process.env[envKey];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function assertBoundaryId(value, label) {
  if (!/^[A-Za-z0-9_.:-]+$/.test(value) || value.length > 128) {
    throw new Error(`${label} must contain only letters, numbers, _, ., :, or -`);
  }
}

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function publicAccount(input) {
  return {
    username: input.username,
    tenantId: input.tenantId,
    operatorId: input.operatorId,
    role: "admin",
  };
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

function fail(message) {
  console.error(`Operator admin bootstrap failed: ${message}`);
  process.exit(1);
}

function redactArgument(value) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return value;
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

function isPrismaUniqueConflict(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
