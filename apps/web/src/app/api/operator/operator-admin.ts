import { randomBytes, scryptSync } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  readOperatorSession,
  toPublicOperatorSession,
  type OperatorRole,
  type OperatorSession,
} from "./operator-session";

export type { OperatorRole } from "./operator-session";

export type OperatorAccountRecord = {
  id: string;
  username: string;
  tenantId: string;
  operatorId: string;
  role: OperatorRole;
  passwordHash: string;
  apiKey: string;
  disabled: boolean;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicOperatorAccountRecord = Pick<
  OperatorAccountRecord,
  "username" | "tenantId" | "operatorId" | "role" | "disabled" | "sessionVersion"
>;

export type CreateOperatorAccountInput = {
  username: string;
  tenantId: string;
  operatorId: string;
  role: OperatorRole;
  passwordHash: string;
  apiKey: string;
};

export type UpdateOperatorAccountInput = {
  role?: OperatorRole;
  disabled?: boolean;
  incrementSessionVersion?: boolean;
};

export type OperatorAdminStore = {
  listByTenant(tenantId: string): Promise<OperatorAccountRecord[]>;
  create(input: CreateOperatorAccountInput): Promise<OperatorAccountRecord>;
  updateByTenantOperatorId(
    tenantId: string,
    operatorId: string,
    input: UpdateOperatorAccountInput,
  ): Promise<OperatorAccountRecord | undefined>;
  audit(action: string, details: Prisma.InputJsonValue): Promise<void>;
};

type PrismaAdminClientLike = {
  operatorAccount: {
    findMany(args: {
      where: { tenantId: string };
      orderBy: Array<{ disabled: "asc" | "desc" } | { createdAt: "asc" | "desc" }>;
    }): Promise<unknown[]>;
    create(args: { data: CreateOperatorAccountInput }): Promise<unknown>;
    update(args: {
      where: { tenantId_operatorId: { tenantId: string; operatorId: string } };
      data: {
        role?: OperatorRole;
        disabled?: boolean;
        sessionVersion?: { increment: number };
      };
    }): Promise<unknown>;
  };
  auditLog: {
    create(args: {
      data: {
        caseId: null;
        action: string;
        details: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
};

export class OperatorAccountConflictError extends Error {}

let operatorAdminStoreForTests: OperatorAdminStore | undefined;

export function setOperatorAdminStoreForTests(store: OperatorAdminStore) {
  operatorAdminStoreForTests = store;
}

export function clearOperatorAdminStoreForTests() {
  operatorAdminStoreForTests = undefined;
}

export async function requireOperatorAdminSession(request: Request): Promise<
  | { status: "ok"; session: OperatorSession }
  | { status: "response"; response: NextResponse }
> {
  const sessionResult = await readOperatorSession(request);

  if (sessionResult.status === "missing") {
    return {
      status: "response",
      response: NextResponse.json(
        { error: "Operator session is required" },
        { status: 401 },
      ),
    };
  }

  if (sessionResult.status === "invalid") {
    return {
      status: "response",
      response: NextResponse.json(
        { error: sessionResult.message },
        { status: 401 },
      ),
    };
  }

  if (sessionResult.status === "misconfigured") {
    return {
      status: "response",
      response: NextResponse.json(
        { error: sessionResult.message },
        { status: 503 },
      ),
    };
  }

  if (!toPublicOperatorSession(sessionResult.session).permissions.manageOperators) {
    return {
      status: "response",
      response: NextResponse.json(
        { error: "Operator account management requires admin permission" },
        { status: 403 },
      ),
    };
  }

  return { status: "ok", session: sessionResult.session };
}

export function operatorAdminStore() {
  return operatorAdminStoreForTests ?? prismaOperatorAdminStore;
}

export function toPublicOperatorAccountRecord(
  account: OperatorAccountRecord,
): PublicOperatorAccountRecord {
  return {
    username: account.username,
    tenantId: account.tenantId,
    operatorId: account.operatorId,
    role: account.role,
    disabled: account.disabled,
    sessionVersion: account.sessionVersion,
  };
}

export function createOperatorPasswordHash(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

const prismaOperatorAdminStore: OperatorAdminStore = {
  async listByTenant(tenantId) {
    const prisma = await prismaClient();
    return (
      await prisma.operatorAccount.findMany({
        where: { tenantId },
        orderBy: [{ disabled: "asc" }, { createdAt: "asc" }],
      })
    ).map(mapOperatorAccountRecord);
  },
  async create(input) {
    try {
      const prisma = await prismaClient();
      return mapOperatorAccountRecord(
        await prisma.operatorAccount.create({ data: input }),
      );
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        throw new OperatorAccountConflictError("Operator account already exists");
      }

      throw error;
    }
  },
  async updateByTenantOperatorId(tenantId, operatorId, input) {
    try {
      const prisma = await prismaClient();
      return mapOperatorAccountRecord(
        await prisma.operatorAccount.update({
          where: {
            tenantId_operatorId: { tenantId, operatorId },
          },
          data: {
            ...(input.role ? { role: input.role } : {}),
            ...(typeof input.disabled === "boolean"
              ? { disabled: input.disabled }
              : {}),
            ...(input.incrementSessionVersion
              ? { sessionVersion: { increment: 1 } }
              : {}),
          },
        }),
      );
    } catch (error) {
      if (isPrismaNotFound(error)) return undefined;
      throw error;
    }
  },
  async audit(action, details) {
    const prisma = await prismaClient();
    await prisma.auditLog.create({
      data: {
        caseId: null,
        action,
        details,
      },
    });
  },
};

async function prismaClient(): Promise<PrismaAdminClientLike> {
  const globalForPrisma = globalThis as typeof globalThis & {
    smartCsOperatorAdminPrisma?: PrismaAdminClientLike;
  };

  if (!globalForPrisma.smartCsOperatorAdminPrisma) {
    const { PrismaClient } = await import("@prisma/client");
    globalForPrisma.smartCsOperatorAdminPrisma =
      new PrismaClient() as unknown as PrismaAdminClientLike;
  }

  return globalForPrisma.smartCsOperatorAdminPrisma;
}

function mapOperatorAccountRecord(value: unknown): OperatorAccountRecord {
  if (!isRecord(value)) {
    throw new Error("Stored operator account must be an object");
  }

  return {
    id: readString(value, "id"),
    username: readString(value, "username"),
    tenantId: readString(value, "tenantId"),
    operatorId: readString(value, "operatorId"),
    role: readRole(value.role),
    passwordHash: readString(value, "passwordHash"),
    apiKey: readString(value, "apiKey"),
    disabled: value.disabled === true,
    sessionVersion: readNumber(value, "sessionVersion"),
    createdAt: readDate(value, "createdAt"),
    updatedAt: readDate(value, "updatedAt"),
  };
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Operator account ${key} must be a non-empty string`);
  }

  return field;
}

function readNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "number" || !Number.isInteger(field) || field < 1) {
    throw new Error(`Operator account ${key} must be a positive integer`);
  }

  return field;
}

function readDate(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (field instanceof Date) return field;
  if (typeof field === "string") return new Date(field);
  throw new Error(`Operator account ${key} must be a Date`);
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

function isPrismaUniqueConflict(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

function isPrismaNotFound(error: unknown) {
  return isRecord(error) && error.code === "P2025";
}
