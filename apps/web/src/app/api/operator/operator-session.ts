import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const OPERATOR_SESSION_COOKIE = "smart_cs_operator_session";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;
const MIN_PRODUCTION_SECRET_LENGTH = 32;
const PLACEHOLDER_SESSION_SECRET = "replace_with_a_long_random_secret";
const DEFAULT_DEMO_ACCOUNT = {
  username: "demo",
  password: "demo123456",
};

export type OperatorRole = "admin" | "operator" | "viewer";

export type OperatorAccount = {
  username: string;
  password?: string;
  passwordHash?: string;
  tenantId: string;
  operatorId: string;
  role: OperatorRole;
  apiKey: string;
  disabled: boolean;
  sessionVersion: number;
};

export type OperatorSession = {
  username: string;
  tenantId: string;
  operatorId: string;
  role: OperatorRole;
  apiKey: string;
};

export type OperatorPermissions = {
  viewCases: boolean;
  confirmReplies: boolean;
  takeoverCases: boolean;
  manageRules: boolean;
  manageOperators: boolean;
};

export type PublicOperatorSession = {
  username: string;
  tenantId: string;
  operatorId: string;
  role: OperatorRole;
  permissions: OperatorPermissions;
};

type SignedSessionPayload = {
  username: string;
  tenantId: string;
  operatorId: string;
  role: OperatorRole;
  sessionVersion: number;
  expiresAt: number;
};

type SessionResult =
  | { status: "ok"; session: OperatorSession }
  | { status: "missing" }
  | { status: "misconfigured"; message: string }
  | { status: "invalid"; message: string };

export type LoginCredentials = {
  username: string;
  password: string;
};

export type OperatorAccountStore = {
  findByUsername(username: string): Promise<OperatorAccount | undefined>;
  findSessionAccount(
    payload: Pick<
      SignedSessionPayload,
      "username" | "tenantId" | "operatorId" | "role"
    >,
  ): Promise<OperatorAccount | undefined>;
};

type PrismaClientLike = {
  operatorAccount: {
    findUnique(args: {
      where:
        | { username: string }
        | { tenantId_operatorId: { tenantId: string; operatorId: string } };
    }): Promise<unknown>;
  };
};

let operatorAccountStoreForTests: OperatorAccountStore | undefined;

export function setOperatorAccountStoreForTests(store: OperatorAccountStore) {
  operatorAccountStoreForTests = store;
}

export function clearOperatorAccountStoreForTests() {
  operatorAccountStoreForTests = undefined;
}

export function getOperatorAccounts(): OperatorAccount[] {
  const rawAccounts = process.env.OPERATOR_SESSION_ACCOUNTS;
  if (!rawAccounts) return [];

  const parsed: unknown = JSON.parse(rawAccounts);
  if (!Array.isArray(parsed)) {
    throw new Error("OPERATOR_SESSION_ACCOUNTS must be a JSON array");
  }

  const accounts = parsed.map(parseAccount);
  if (isProduction()) {
    assertNoDefaultDemoAccount(accounts);
  }

  return accounts;
}

export async function authenticateOperator(
  credentials: LoginCredentials,
): Promise<OperatorAccount | undefined> {
  const account = await operatorAccountStore().findByUsername(
    credentials.username,
  );
  if (!account || account.disabled) return undefined;
  return accountPasswordMatches(account, credentials.password)
    ? account
    : undefined;
}

export function createOperatorSessionCookie(account: OperatorAccount) {
  const secret = requiredSessionSecret();
  const payload: SignedSessionPayload = {
    username: account.username,
    tenantId: account.tenantId,
    operatorId: account.operatorId,
    role: account.role,
    sessionVersion: account.sessionVersion,
    expiresAt: Date.now() + sessionTtlSeconds() * 1000,
  };

  return signPayload(payload, secret);
}

export async function readOperatorSession(request: Request): Promise<SessionResult> {
  const token = readCookie(request.headers.get("cookie"), OPERATOR_SESSION_COOKIE);
  if (!token) return { status: "missing" };

  let secret: string;
  try {
    secret = requiredSessionSecret();
  } catch {
    return {
      status: "misconfigured",
      message: "Operator session secret is not configured",
    };
  }

  const payload = verifySignedPayload(token, secret);
  if (!payload) {
    return { status: "invalid", message: "Operator session is invalid" };
  }

  if (payload.expiresAt <= Date.now()) {
    return { status: "invalid", message: "Operator session has expired" };
  }

  let account: OperatorAccount | undefined;
  try {
    account = await operatorAccountStore().findSessionAccount(payload);
  } catch {
    return {
      status: "misconfigured",
      message: "Operator session accounts are not configured",
    };
  }

  if (
    !account ||
    account.disabled ||
    account.sessionVersion !== payload.sessionVersion
  ) {
    return { status: "invalid", message: "Operator session is invalid" };
  }

  return {
    status: "ok",
    session: {
      username: account.username,
      tenantId: account.tenantId,
      operatorId: account.operatorId,
      role: account.role,
      apiKey: account.apiKey,
    },
  };
}

export function toPublicOperatorSession(
  session: OperatorSession,
): PublicOperatorSession {
  return {
    username: session.username,
    tenantId: session.tenantId,
    operatorId: session.operatorId,
    role: session.role,
    permissions: permissionsForRole(session.role),
  };
}

export function toPublicOperatorAccount(
  account: OperatorAccount,
): PublicOperatorSession {
  return {
    username: account.username,
    tenantId: account.tenantId,
    operatorId: account.operatorId,
    role: account.role,
    permissions: permissionsForRole(account.role),
  };
}

export function setOperatorSessionCookie(
  response: NextResponse,
  account: OperatorAccount,
) {
  response.cookies.set({
    name: OPERATOR_SESSION_COOKIE,
    value: createOperatorSessionCookie(account),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
}

export function clearOperatorSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: OPERATOR_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function parseAccount(value: unknown): OperatorAccount {
  if (!isRecord(value)) {
    throw new Error("Operator account must be an object");
  }

  const account = {
    username: readString(value, "username"),
    password: readOptionalString(value, "password"),
    passwordHash: readOptionalString(value, "passwordHash"),
    tenantId: readString(value, "tenantId"),
    operatorId: readString(value, "operatorId"),
    role: readRole(value.role),
    apiKey: readString(value, "apiKey"),
    disabled: value.disabled === true,
    sessionVersion: readOptionalPositiveInteger(value, "sessionVersion") ?? 1,
  };

  if (!account.password && !account.passwordHash) {
    throw new Error("Operator account password or passwordHash is required");
  }

  if (isProduction() && account.password) {
    throw new Error("Operator account plaintext password is not allowed in production");
  }

  return account;
}

function operatorAccountStore(): OperatorAccountStore {
  if (operatorAccountStoreForTests) return operatorAccountStoreForTests;
  if (shouldUseEnvOperatorAccounts()) return envOperatorAccountStore;
  return prismaOperatorAccountStore;
}

function shouldUseEnvOperatorAccounts() {
  if (process.env.OPERATOR_ACCOUNT_SOURCE === "database") return false;
  if (process.env.OPERATOR_ACCOUNT_SOURCE === "env") return true;
  if (isProduction()) return false;
  return Boolean(process.env.OPERATOR_SESSION_ACCOUNTS);
}

const envOperatorAccountStore: OperatorAccountStore = {
  async findByUsername(username) {
    return getOperatorAccounts().find((account) => account.username === username);
  },
  async findSessionAccount(payload) {
    return getOperatorAccounts().find(
      (account) =>
        account.username === payload.username &&
        account.tenantId === payload.tenantId &&
        account.operatorId === payload.operatorId &&
        account.role === payload.role,
    );
  },
};

const prismaOperatorAccountStore: OperatorAccountStore = {
  async findByUsername(username) {
    const prisma = await prismaClient();
    return mapStoredOperatorAccount(
      await prisma.operatorAccount.findUnique({ where: { username } }),
    );
  },
  async findSessionAccount(payload) {
    const prisma = await prismaClient();
    const account = mapStoredOperatorAccount(
      await prisma.operatorAccount.findUnique({
        where: {
          tenantId_operatorId: {
            tenantId: payload.tenantId,
            operatorId: payload.operatorId,
          },
        },
      }),
    );

    if (
      !account ||
      account.username !== payload.username ||
      account.role !== payload.role
    ) {
      return undefined;
    }

    return account;
  },
};

async function prismaClient(): Promise<PrismaClientLike> {
  const globalForPrisma = globalThis as typeof globalThis & {
    smartCsOperatorPrisma?: PrismaClientLike;
  };

  if (!globalForPrisma.smartCsOperatorPrisma) {
    const { PrismaClient } = await import("@prisma/client");
    globalForPrisma.smartCsOperatorPrisma = new PrismaClient();
  }

  return globalForPrisma.smartCsOperatorPrisma;
}

function mapStoredOperatorAccount(value: unknown): OperatorAccount | undefined {
  if (!value) return undefined;
  if (!isRecord(value)) {
    throw new Error("Stored operator account must be an object");
  }

  return {
    username: readString(value, "username"),
    passwordHash: readString(value, "passwordHash"),
    tenantId: readString(value, "tenantId"),
    operatorId: readString(value, "operatorId"),
    role: readRole(value.role),
    apiKey: readString(value, "apiKey"),
    disabled: value.disabled === true,
    sessionVersion: readRequiredPositiveInteger(value, "sessionVersion"),
  };
}

function requiredSessionSecret() {
  const secret = process.env.OPERATOR_SESSION_SECRET;
  if (!secret) {
    throw new Error("OPERATOR_SESSION_SECRET is required");
  }

  if (
    isProduction() &&
    (secret === PLACEHOLDER_SESSION_SECRET ||
      secret.length < MIN_PRODUCTION_SECRET_LENGTH)
  ) {
    throw new Error("OPERATOR_SESSION_SECRET is not production safe");
  }

  return secret;
}

function assertNoDefaultDemoAccount(accounts: OperatorAccount[]) {
  const hasDefaultDemoAccount = accounts.some(
    (account) =>
      account.username === DEFAULT_DEMO_ACCOUNT.username &&
      account.password === DEFAULT_DEMO_ACCOUNT.password,
  );

  if (hasDefaultDemoAccount) {
    throw new Error("Default demo operator account is not allowed in production");
  }
}

function accountPasswordMatches(account: OperatorAccount, password: string) {
  if (account.passwordHash) {
    return verifyPasswordHash(password, account.passwordHash);
  }

  return account.password === password;
}

function verifyPasswordHash(password: string, passwordHash: string) {
  const parts = passwordHash.split(":");
  const [algorithm, salt, expectedHash] = parts;
  if (
    parts.length !== 3 ||
    algorithm !== "scrypt" ||
    !salt ||
    !expectedHash ||
    !isBase64Url(expectedHash)
  ) {
    throw new Error("Unsupported operator passwordHash format");
  }

  const actualHash = scryptSync(password, salt, 32).toString("base64url");
  return safeEqual(actualHash, expectedHash);
}

function isBase64Url(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function permissionsForRole(role: OperatorRole): OperatorPermissions {
  if (role === "admin") {
    return {
      viewCases: true,
      confirmReplies: true,
      takeoverCases: true,
      manageRules: true,
      manageOperators: true,
    };
  }

  if (role === "operator") {
    return {
      viewCases: true,
      confirmReplies: true,
      takeoverCases: true,
      manageRules: false,
      manageOperators: false,
    };
  }

  return {
    viewCases: true,
    confirmReplies: false,
    takeoverCases: false,
    manageRules: false,
    manageOperators: false,
  };
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function sessionTtlSeconds() {
  const rawTtl = Number(process.env.OPERATOR_SESSION_TTL_SECONDS);
  return Number.isFinite(rawTtl) && rawTtl > 0
    ? Math.floor(rawTtl)
    : DEFAULT_SESSION_TTL_SECONDS;
}

function signPayload(payload: SignedSessionPayload, secret: string) {
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

function verifySignedPayload(
  token: string,
  secret: string,
): SignedSessionPayload | undefined {
  const [encodedPayload, tokenSignature] = token.split(".");
  if (!encodedPayload || !tokenSignature) return undefined;

  if (!safeEqual(tokenSignature, signature(encodedPayload, secret))) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(base64urlDecode(encodedPayload));
    if (!isSignedSessionPayload(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function signature(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;

  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function base64urlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64urlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function isSignedSessionPayload(value: unknown): value is SignedSessionPayload {
  return (
    isRecord(value) &&
    typeof value.username === "string" &&
    typeof value.tenantId === "string" &&
    typeof value.operatorId === "string" &&
    readRole(value.role) === value.role &&
    typeof value.sessionVersion === "number" &&
    typeof value.expiresAt === "number"
  );
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Operator account ${key} must be a non-empty string`);
  }

  return field;
}

function readOptionalString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Operator account ${key} must be a non-empty string`);
  }

  return field;
}

function readOptionalPositiveInteger(
  value: Record<string, unknown>,
  key: string,
) {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== "number" || !Number.isInteger(field) || field < 1) {
    throw new Error(`Operator account ${key} must be a positive integer`);
  }

  return field;
}

function readRequiredPositiveInteger(
  value: Record<string, unknown>,
  key: string,
) {
  const field = readOptionalPositiveInteger(value, key);
  if (field === undefined) {
    throw new Error(`Operator account ${key} must be a positive integer`);
  }

  return field;
}

function readRole(value: unknown): OperatorRole {
  if (value === "admin" || value === "operator" || value === "viewer") {
    return value;
  }

  throw new Error("Operator account role must be admin, operator, or viewer");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
