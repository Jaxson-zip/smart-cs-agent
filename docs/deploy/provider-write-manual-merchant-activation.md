# PR82 Provider Write Manual Merchant Activation Gate

PR82 adds the manual merchant activation gate after PR81 provider write general availability approval. It validates sanitized `smart-cs-agent.provider-write-manual-merchant-activation.v1` evidence under `provider-write-manual-merchant-activation-artifacts/`, binds that activation to the PR81 `smart-cs-agent.provider-write-general-availability-approval.v1` file under `provider-write-general-availability-approval-artifacts/`, and rechecks the PR81-to-PR80-to-PR79 evidence chain through `smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1` and `smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1`.

Passing this gate means one human-reviewed merchant and one channel have been approved for manual activation planning inside the already approved `general_availability` scope. It still does not activate the merchant automatically, does not activate the next merchant automatically, and does not change runtime provider write behavior.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-manual-merchant-activation
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_FILE=provider-write-manual-merchant-activation-artifacts/manual-merchant-activation.json
set SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_APPROVAL_FILE=provider-write-general-availability-approval-artifacts/general-availability-approval.json
set SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_CLOSEOUT_REVIEW_FILE=provider-write-graduated-rollout-closeout-review-artifacts/graduated-rollout-closeout-review.json
set SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_RUN_LEDGER_FILE=provider-write-graduated-rollout-run-ledger-artifacts/graduated-rollout-run-ledger.json
set SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_REQUIRE_PASS=true
npm run verify:provider-write-manual-merchant-activation:safe
```

The `:safe` command fails closed unless the activation, PR81 approval, PR80 closeout review, and PR79 run ledger files are all supplied. The verifier recomputes `providerWriteGeneralAvailabilityApprovalSha256`, checks the approval file's `providerWriteGraduatedRolloutCloseoutReviewSha256`, and rechecks the closeout review's `providerWriteGraduatedRolloutRunLedgerSha256`.

## Evidence Shape

The activation evidence must include:

- `target`: rollout fingerprint, `rolloutTrack=general_availability`, one merchant fingerprint, one channel, and the same safe change ticket as the PR81 approval.
- `merchantScope`: the same merchant and channel as the target, allowed low-risk actions, daily write limit, coupon cap, and `businessHoursOnly=true`.
- `activation`: `approved_for_manual_activation` or `rejected_needs_investigation`, requester and reviewer fingerprints, distinct security, operations, and merchant-success reviewers, activation timestamp, and `secondReviewCompleted=true`.
- `prerequisiteEvidence`: PR81 approval, production launch, static CI, kill-switch control-plane, live executor control-plane, and execution-attempt visibility verifier proof.
- `launchControls`: `automaticActivationEnabled=false`, `automaticNextMerchantEnabled=false`, `manualApprovalBeforeProviderWrites=true`, `noAutomaticCustomerVisibleReplies=true`, `liveExecutorKillSwitchDefaultOn=true`, per-merchant rollback readiness, rollback on failed mutation, stop on customer complaint, and stop on rejected compensation.
- `artifactBindings`: `providerWriteGeneralAvailabilityApprovalSha256`, audit export SHA-256, production launch SHA-256, and production static CI SHA-256. The bound PR81 approval must still bind `providerWriteGraduatedRolloutCloseoutReviewSha256`, and the bound PR80 closeout review must still bind `providerWriteGraduatedRolloutRunLedgerSha256`.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

Safe/pass evidence requires `activation.activationStatus=approved_for_manual_activation`. A `rejected_needs_investigation` package is valid outside pass mode so release owners can archive a blocked merchant activation without pretending it passed.

## Scope Rules

The activation must stay inside the PR81 approval scope:

- one merchant fingerprint and one channel only;
- merchant and channel must exist in the PR81 `expansionScope`;
- allowed actions must be a subset of the PR81 allowed actions;
- `maxDailyProviderWrites` must not exceed PR81 `maxDailyProviderWritesPerMerchant`;
- `maxCouponAmountCents` must not exceed PR81 `maxCouponAmountCents`;
- the target remains `general_availability`.

## Safety Boundary

This verifier:

- does not enable provider writes;
- does not call provider APIs;
- does not execute provider writes;
- does not read provider credentials;
- does not read production databases;
- does not open payload escrow;
- does not send customer-visible replies;
- does not activate merchants automatically;
- does not activate the next merchant automatically.

The activation, approval, closeout review, and run ledger packages must not include raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment data, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR82 only after PR81 passes and release owners are ready to review a single merchant/channel activation:

```bash
npm run verify:provider-write-general-availability-approval:safe
npm run verify:provider-write-manual-merchant-activation
npm run verify:provider-write-manual-merchant-activation:safe
```

Passing PR82 permits a human release owner to continue toward manually activating the named merchant through a future runtime control. It still keeps `automaticActivationEnabled=false`, `automaticNextMerchantEnabled=false`, `manualApprovalBeforeProviderWrites=true`, `noAutomaticCustomerVisibleReplies=true`, and `liveExecutorKillSwitchDefaultOn=true`.
