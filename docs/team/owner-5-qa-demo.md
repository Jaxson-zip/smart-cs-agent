# Owner 5: QA And Demo Script

## Mission

Make the feature demonstrable. A new teammate should be able to follow your doc and see the full sandbox loop without asking the rest of the team how it works.

## Write Scope

You own:

- `docs/demo/wecom-sandbox-demo.md`
- `docs/demo/wecom-sandbox-payloads/*.json`
- `apps/api/test/*` if tests already exist or are added by API owners
- `apps/web/src/app/*.test.*` only if a web test setup exists

Coordinate before touching:

- `apps/api/src/wecom/*`
- `apps/api/src/agent/*`
- `apps/web/src/app/page.tsx`

## Required Demo Scenarios

Create demo payloads for:

1. Address change before shipment.
2. Logistics inquiry.
3. Package damage / coupon compensation.
4. Customer rejects compensation proposal.
5. Refund dispute or complaint escalation.

Each scenario must document:

- Input message.
- Expected category.
- Expected risk level.
- Expected automation mode.
- Expected customer-facing reply.
- Expected operator UI result.

## Demo Standard

The demo must prove:

- Low-risk auto-execute works.
- Medium-risk human-confirm works.
- High-risk human-takeover works.

## Acceptance

The demo doc must include:

- How to start API.
- How to start web.
- Curl commands or JSON payload paths.
- Expected responses.
- Manual UI checklist.
- Responsive QA checklist.

Do not require real Taobao, Douyin, payment, refund, or WeCom production credentials.
