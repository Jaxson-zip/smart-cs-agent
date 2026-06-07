# PR56 Production Branch Protection Gate

This stage defines the production branch protection baseline that must wrap the PR55 static CI workflow before commercial launch. It verifies that the default production branch is protected, that the `Static production gates` job is configured as a required status check, and that pull request review controls block unreviewed or stale merges.

This verifier is local and evidence-only. It does not call the GitHub API, does not mutate branch protection, does not read GitHub secrets, does not deploy, does not publish images, does not call real channels, does not execute provider reads or writes, and does not send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-branch-protection
```

Run the safe evidence gate after a repository administrator has exported or manually recorded sanitized branch protection facts:

```bash
SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE=production-branch-protection-artifacts/production-branch-protection.json \
SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true \
npm run verify:production-branch-protection:safe
```

The evidence file must use schema `smart-cs-agent.production-branch-protection.v1` and must live under `production-branch-protection-artifacts/`. The verifier prints only the default branch plus a success marker.

## Required Evidence Shape

The branch protection package should include:

- Repository: a repository fingerprint and default branch, normally `main`.
- Protected branches: at least the default branch and `main`.
- Required status checks: `strict=true` and `contexts` containing `Static production gates`.
- Pull request review: required reviews, at least one approving review, stale review dismissal, code owner review, and last-push approval.
- Merge policy: conversation resolution, linear history, no force pushes, no branch deletions, and no bypass actors.
- Safety: no secrets, raw tokens, GitHub API calls by the verifier, branch protection mutations by the verifier, or production deployments.

## Security Boundary

Do not put GitHub tokens, PATs, installation tokens, API keys, private keys, passwords, webhook secrets, provider credentials, operator keys, bearer tokens, raw API responses, or secret-manager paths into branch protection evidence.

This verifier rejects unsupported sensitive fields such as `githubToken`, `installationToken`, `accessToken`, `privateKey`, `apiKey`, `token`, and `secret`. It also rejects secret-looking values such as GitHub token prefixes, bearer tokens, embedded credentials, and known leak sentinels.

## Workflow Placement

Run this gate after:

```bash
npm run verify:production-static-ci
npm run verify:production-launch
```

The actual GitHub repository setting still has to be applied by a repository administrator or an audited infrastructure workflow with the right permissions. This repo verifier only proves that the required policy shape and evidence boundary are documented and locally checkable.

## Verification

Run:

```bash
npm run verify:production-branch-protection
npm run verify:production-launch
```

Use `npm run verify:production-branch-protection:safe` in release CI or a launch terminal after `SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE` and `SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true` are injected through the environment.
