# Smart CS Agent Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the monorepo technical foundation for Smart CS Agent v1: independent Next.js frontend, NestJS backend, shared schemas, Prisma/PostgreSQL setup, WebSocket event contract, GSAP readiness, and a multi-agent development workflow.

**Architecture:** Convert the current single Next.js app into a monorepo with `apps/web`, `apps/api`, and `packages/shared`. Keep the existing UI runnable while adding a clean backend boundary, shared contracts, and database infrastructure. This phase does not implement the full after-sales business loop; it creates the base that subsequent phase plans will build on.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, GSAP, @gsap/react, NestJS, Prisma, PostgreSQL, Zod, WebSocket event types.

---

## Scope

This plan implements only Phase 1 from the v1 design document:

- Monorepo layout.
- Existing Next app moved to `apps/web`.
- New NestJS backend scaffold in `apps/api`.
- Shared package in `packages/shared`.
- Prisma schema and Docker PostgreSQL development setup.
- Initial REST health endpoint.
- Initial WebSocket gateway event contract.
- GSAP dependencies added to the frontend.
- Basic validation commands.
- Multi-agent implementation and review workflow.

The following are intentionally assigned to subsequent phase plans:

- Channel ingestion.
- Mock Taobao, Douyin, and Shopify providers.
- Agent tool execution.
- AfterSaleCase state machine.
- Approval center.
- Audit log UI.
- Analytics UI.
- Real LLM calls.

## Multi-Agent Collaboration Model

Use multiple agents after this foundation plan is approved.

Recommended roles:

- **Implementation Agent:** executes one task at a time.
- **Review Agent:** reviews the diff after each task for architecture drift, missing tests, and accidental scope creep.
- **Coordinator:** integrates feedback, runs verification, and decides when to continue.

Rules:

- Only one implementation agent edits files for a task.
- Review agents do not edit files; they return findings.
- Do not let two agents modify the same package in parallel during Phase 1.
- Commit after each completed task when the repository is ready for commits.
- If the repository still has large untracked pre-existing content, stage only files touched by the task.

## Target File Structure

```text
smart-cs-agent
├─ apps
│  ├─ web
│  │  ├─ src
│  │  ├─ public
│  │  ├─ package.json
│  │  ├─ next.config.ts
│  │  ├─ tsconfig.json
│  │  └─ eslint.config.mjs
│  └─ api
│     ├─ src
│     │  ├─ app.module.ts
│     │  ├─ main.ts
│     │  ├─ health
│     │  │  ├─ health.controller.ts
│     │  │  └─ health.module.ts
│     │  └─ realtime
│     │     ├─ realtime.gateway.ts
│     │     └─ realtime.module.ts
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ nest-cli.json
├─ packages
│  └─ shared
│     ├─ src
│     │  ├─ index.ts
│     │  ├─ api.ts
│     │  ├─ events.ts
│     │  └─ tool-schemas.ts
│     ├─ package.json
│     └─ tsconfig.json
├─ prisma
│  ├─ schema.prisma
│  └─ seed.ts
├─ docs
├─ docker-compose.yml
├─ package.json
├─ tsconfig.base.json
└─ README.md
```

## Task 1: Create Monorepo Root Configuration

**Files:**

- Modify: `package.json`
- Create: `tsconfig.base.json`
- Create: `.npmrc`
- Modify: `.gitignore`

- [ ] **Step 1: Replace root `package.json` with workspace scripts**

Use this content:

```json
{
  "name": "smart-cs-agent",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace @smart-cs-agent/web",
    "dev:web": "npm run dev --workspace @smart-cs-agent/web",
    "dev:api": "npm run start:dev --workspace @smart-cs-agent/api",
    "build": "npm run build --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "devDependencies": {
    "prisma": "^6.16.0",
    "tsx": "^4.20.5",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create shared TypeScript base config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@smart-cs-agent/shared": ["packages/shared/src/index.ts"],
      "@smart-cs-agent/shared/*": ["packages/shared/src/*"]
    }
  }
}
```

- [ ] **Step 3: Create `.npmrc`**

Create `.npmrc`:

```text
legacy-peer-deps=true
```

- [ ] **Step 4: Update `.gitignore`**

Ensure `.gitignore` contains these lines:

```text
node_modules
.next
dist
coverage
.env
.env.local
.env.*.local
.superpowers/
```

- [ ] **Step 5: Verify root JSON parses**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('tsconfig.base.json','utf8')); console.log('root config ok')"
```

Expected:

```text
root config ok
```

## Task 2: Move Existing Next App Into `apps/web`

**Files:**

- Move: `src` -> `apps/web/src`
- Move: `public` -> `apps/web/public`
- Move: `next.config.ts` -> `apps/web/next.config.ts`
- Move: `tsconfig.json` -> `apps/web/tsconfig.json`
- Move: `eslint.config.mjs` -> `apps/web/eslint.config.mjs`
- Move: `postcss.config.mjs` -> `apps/web/postcss.config.mjs`
- Move: `next-env.d.ts` -> `apps/web/next-env.d.ts`
- Create: `apps/web/package.json`

- [ ] **Step 1: Create `apps/web` and move web files**

Move the existing Next.js files into `apps/web` while preserving paths under `src` and `public`.

After moving, verify:

```powershell
Test-Path apps\web\src\app\page.tsx
Test-Path apps\web\src\lib\orchestrator.ts
Test-Path apps\web\public\next.svg
```

Expected:

```text
True
True
True
```

- [ ] **Step 2: Create `apps/web/package.json`**

Use this content:

```json
{
  "name": "@smart-cs-agent/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/openai": "^3.0.67",
    "@ai-sdk/react": "^3.0.196",
    "@gsap/react": "^2.1.2",
    "@smart-cs-agent/shared": "file:../../packages/shared",
    "ai": "^6.0.195",
    "clsx": "^2.1.1",
    "framer-motion": "^12.40.0",
    "gsap": "^3.13.0",
    "lucide-react": "^1.17.0",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "tailwind-merge": "^3.6.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 3: Update `apps/web/tsconfig.json`**

Use this content:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "incremental": true,
    "jsx": "react-jsx",
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"],
      "@smart-cs-agent/shared": ["../../packages/shared/src/index.ts"],
      "@smart-cs-agent/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Install workspace dependencies**

Run:

```powershell
npm.cmd install
```

Expected: install completes and creates/updates root `package-lock.json`.

- [ ] **Step 5: Verify web app still typechecks enough to expose existing issues**

Run:

```powershell
npm.cmd run lint --workspace @smart-cs-agent/web
```

Expected: lint may fail with pre-existing errors in `page.tsx`, `orchestrator.ts`, and unused imports. Do not fix them in this task unless they were caused by the move.

## Task 3: Create Shared Package Contracts

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/api.ts`
- Create: `packages/shared/src/events.ts`
- Create: `packages/shared/src/tool-schemas.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@smart-cs-agent/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create shared API types**

Create `packages/shared/src/api.ts`:

```ts
import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("smart-cs-agent-api"),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
```

- [ ] **Step 4: Create WebSocket event types**

Create `packages/shared/src/events.ts`:

```ts
import { z } from "zod";

export const AgentEventTypeSchema = z.enum([
  "conversation.message.received",
  "agent.thought.created",
  "agent.intent.detected",
  "policy.search.completed",
  "risk.evaluation.completed",
  "tool.call.started",
  "tool.call.completed",
  "approval.created",
  "approval.updated",
  "case.status.updated",
  "notification.sent",
  "notification.failed",
  "agent.response.completed",
  "human.takeover.started",
  "human.takeover.ended",
]);

export const AgentEventSchema = z.object({
  id: z.string(),
  type: AgentEventTypeSchema,
  conversationId: z.string().optional(),
  caseId: z.string().optional(),
  createdAt: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
```

- [ ] **Step 5: Create initial tool schemas**

Create `packages/shared/src/tool-schemas.ts`:

```ts
import { z } from "zod";

export const ToolRiskLevelSchema = z.enum(["low", "medium", "high"]);

export const ToolCallStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "failed",
  "blocked",
]);

export const CheckOrderToolInputSchema = z.object({
  orderId: z.string().min(1),
});

export const ModifyAddressToolInputSchema = z.object({
  orderId: z.string().min(1),
  newAddress: z.string().min(1),
});

export const IssueCouponToolInputSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
});

export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>;
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;
export type CheckOrderToolInput = z.infer<typeof CheckOrderToolInputSchema>;
export type ModifyAddressToolInput = z.infer<typeof ModifyAddressToolInputSchema>;
export type IssueCouponToolInput = z.infer<typeof IssueCouponToolInputSchema>;
```

- [ ] **Step 6: Export shared package API**

Create `packages/shared/src/index.ts`:

```ts
export * from "./api";
export * from "./events";
export * from "./tool-schemas";
```

- [ ] **Step 7: Run shared typecheck**

Run:

```powershell
npm.cmd run typecheck --workspace @smart-cs-agent/shared
```

Expected: PASS.

## Task 4: Scaffold NestJS API App

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/realtime/realtime.module.ts`
- Create: `apps/api/src/realtime/realtime.gateway.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@smart-cs-agent/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "nest start",
    "start:dev": "nest start --watch",
    "build": "nest build",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.9",
    "@nestjs/core": "^11.1.9",
    "@nestjs/platform-express": "^11.1.9",
    "@nestjs/platform-socket.io": "^11.1.9",
    "@nestjs/websockets": "^11.1.9",
    "@prisma/client": "^6.16.0",
    "@smart-cs-agent/shared": "file:../../packages/shared",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "socket.io": "^4.8.1",
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.14",
    "@nestjs/schematics": "^11.0.9",
    "@nestjs/testing": "^11.1.9",
    "@types/node": "^20",
    "@typescript-eslint/eslint-plugin": "^8.49.0",
    "@typescript-eslint/parser": "^8.49.0",
    "eslint": "^9",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "noEmit": false,
    "declaration": true,
    "sourceMap": true,
    "paths": {
      "@smart-cs-agent/shared": ["../../packages/shared/src/index.ts"],
      "@smart-cs-agent/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 4: Create API bootstrap**

Create `apps/api/src/main.ts`:

```ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
```

- [ ] **Step 5: Create root module**

Create `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [HealthModule, RealtimeModule],
})
export class AppModule {}
```

- [ ] **Step 6: Create health module and controller**

Create `apps/api/src/health/health.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

Create `apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@smart-cs-agent/shared";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "smart-cs-agent-api",
      timestamp: new Date().toISOString(),
    };
  }
}
```

- [ ] **Step 7: Create realtime module and gateway**

Create `apps/api/src/realtime/realtime.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
```

Create `apps/api/src/realtime/realtime.gateway.ts`:

```ts
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { AgentEvent } from "@smart-cs-agent/shared";
import type { Server } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  private server!: Server;

  publishAgentEvent(event: AgentEvent) {
    this.server.emit("agent:event", event);
  }

  @SubscribeMessage("agent:ping")
  handlePing(@MessageBody() payload: { timestamp?: string }) {
    return {
      event: "agent:pong",
      data: {
        timestamp: payload.timestamp ?? new Date().toISOString(),
      },
    };
  }
}
```

- [ ] **Step 8: Install dependencies**

Run:

```powershell
npm.cmd install
```

Expected: install completes.

- [ ] **Step 9: Typecheck API**

Run:

```powershell
npm.cmd run typecheck --workspace @smart-cs-agent/api
```

Expected: PASS.

## Task 5: Add Prisma and PostgreSQL Development Setup

**Files:**

- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: smart-cs-agent-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: smartcs
      POSTGRES_PASSWORD: smartcs
      POSTGRES_DB: smartcs
    ports:
      - "5432:5432"
    volumes:
      - smart-cs-agent-postgres:/var/lib/postgresql/data

volumes:
  smart-cs-agent-postgres:
```

- [ ] **Step 2: Create `.env.example`**

```text
DATABASE_URL="postgresql://smartcs:smartcs@localhost:5432/smartcs?schema=public"
OPENAI_API_KEY=""
WEB_ORIGIN="http://localhost:3000"
PORT=4000
```

- [ ] **Step 3: Create initial Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(cuid())
  name      String
  shops     Shop[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Shop {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 4: Create Prisma seed**

Create `prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo_tenant" },
    update: {},
    create: {
      id: "demo_tenant",
      name: "Demo Ecommerce Tenant",
      shops: {
        create: {
          id: "demo_shop",
          name: "Demo Fashion Store",
        },
      },
    },
  });

  console.log(`Seeded tenant ${tenant.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 5: Generate Prisma client**

Run:

```powershell
Copy-Item .env.example .env -Force
npm.cmd run db:generate
```

Expected: Prisma client generated.

- [ ] **Step 6: Start Postgres**

Run:

```powershell
docker compose up -d postgres
```

Expected: Postgres container starts. If Docker is unavailable, record that as a local environment blocker and continue with type-level verification only.

- [ ] **Step 7: Run initial migration and seed**

Run:

```powershell
npm.cmd run db:migrate -- --name init
npm.cmd run db:seed
```

Expected:

```text
Seeded tenant Demo Ecommerce Tenant
```

## Task 6: Add Frontend API and Realtime Client Boundaries

**Files:**

- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/realtime-client.ts`

- [ ] **Step 1: Create API client helper**

Create `apps/web/src/lib/api-client.ts`:

```ts
import { HealthResponseSchema, type HealthResponse } from "@smart-cs-agent/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }

  return HealthResponseSchema.parse(await response.json());
}
```

- [ ] **Step 2: Create realtime client boundary**

Create `apps/web/src/lib/realtime-client.ts`:

```ts
import type { AgentEvent } from "@smart-cs-agent/shared";

export type AgentEventHandler = (event: AgentEvent) => void;

export interface RealtimeClient {
  connect(): void;
  disconnect(): void;
  onAgentEvent(handler: AgentEventHandler): () => void;
}

export function createNoopRealtimeClient(): RealtimeClient {
  const handlers = new Set<AgentEventHandler>();

  return {
    connect() {
      return undefined;
    },
    disconnect() {
      handlers.clear();
    },
    onAgentEvent(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
```

- [ ] **Step 3: Typecheck web client boundaries**

Run:

```powershell
npm.cmd run typecheck --workspace @smart-cs-agent/web
```

Expected: may fail because of pre-existing app issues. New files should not be the source of failures.

## Task 7: Verification and Review

**Files:**

- No new files.

- [ ] **Step 1: Run workspace typechecks**

Run:

```powershell
npm.cmd run typecheck --workspaces --if-present
```

Expected: shared and api pass. Web may expose pre-existing issues that should be listed separately.

- [ ] **Step 2: Run workspace lint**

Run:

```powershell
npm.cmd run lint --workspaces --if-present
```

Expected: API should lint or report missing ESLint config if not configured yet; web may show existing lint errors from the current demo. Record results.

- [ ] **Step 3: Run API health endpoint manually**

Start API:

```powershell
npm.cmd run start:dev --workspace @smart-cs-agent/api
```

In another terminal:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

Expected shape:

```text
status    : ok
service   : smart-cs-agent-api
timestamp : <ISO timestamp>
```

- [ ] **Step 4: Review diff for accidental scope creep**

Check:

```powershell
git status --short
git diff --stat
```

Expected: changes are limited to monorepo foundation, package config, shared contracts, API scaffold, Prisma setup, and frontend client boundaries.

## Follow-Up Plans After Phase 1

Create separate plans for:

1. Channel ingestion and conversation loop.
2. Ecommerce business data and AfterSaleCase state machine.
3. Agent orchestration, tool registry, risk rules, and response timing.
4. Workbench, Inbox, WebSocket UI, and GSAP interaction system.
5. Approvals, audit logs, analytics, and end-to-end demo flows.
