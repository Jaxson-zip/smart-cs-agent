# Smart CS Agent Team Workbench

This folder is the handoff center for teammates and other coding agents.

Start here:

1. Pull the shared development branch.
2. Pick exactly one owner packet.
3. Create your own feature branch from the shared development branch.
4. Only edit files inside your write scope.
5. Open a PR back to `codex/wecom-sandbox-after-sales`.

Shared development branch:

```bash
git fetch origin
git switch codex/wecom-sandbox-after-sales
git pull --ff-only origin codex/wecom-sandbox-after-sales
```

Feature branch example:

```bash
git switch -c feat/wecom-sandbox-channel
```

## Owner Packets

- Owner 1: [Shared Contracts And Data](./owner-1-shared-contracts.md)
- Owner 2: [WeCom Sandbox Channel](./owner-2-wecom-channel.md)
- Owner 3: [Agent Risk And Actions](./owner-3-agent-risk-actions.md)
- Owner 4: [Operator Workbench UI](./owner-4-operator-workbench.md)
- Owner 5: [QA And Demo Script](./owner-5-qa-demo.md)

## Coordination Rules

- Contracts are the source of truth. If Owner 1 changes schema names, notify everyone.
- Do not show internal AI/debug language in operator UI.
- Do not implement real Taobao, Douyin, payment, or refund APIs in this phase.
- Low-risk cases may auto-execute through mock actions.
- Medium-risk cases require operator confirmation.
- High-risk cases must route to human takeover.
- Every owner should run relevant typecheck/lint before opening a PR.

## Integration Owner Checklist

- [ ] Owner 1 shared contracts merged first.
- [ ] Owner 2 WeCom sandbox endpoint accepts inbound messages.
- [ ] Owner 3 decision service handles all category/risk combinations.
- [ ] Owner 4 UI reads or mirrors the agreed case model.
- [ ] Owner 5 demo proves auto-execute, human-confirm, and human-takeover.
- [ ] Full workspace typecheck passes.
- [ ] Full workspace lint passes.
