## Implementation Plan: One-Time Payment Allowance for SocialPay

### Summary
Payments through the deployed ArcSocialPay contract currently approve the exact payment amount each time (two transactions per payment). The app will approve a larger USDC allowance once, with a limit the user picks in Settings, so later payments within the limit are a single transaction.

### Architecture
- Blockchain: Arc Mainnet (5042). USDC `0x3600000000000000000000000000000000000000`; allowance granted to contract `0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54`.
- Contract: no changes. The deployed contract pulls funds with `transferFrom`, so it needs an allowance and has no `permit`.
- Approval rule: if current allowance < payment, approve `max(payment, user limit)`. If the payment exceeds the limit, approve exactly the payment. "Exact" mode keeps today's behaviour.
- Setting: stored in the browser with the other settings (`socialpay:settings:v1`). Default $100. Choices: Exact, $50, $100, $500, $1,000, custom (max 6 decimals, capped at 1,000,000).
- Frontend: new "Payment approval" card in Settings showing the limit picker, live on-chain remaining allowance, and a Revoke button (approve 0). Pay preview states whether an approval is needed.
- Wallet: ConnectKit + wagmi as today. The wallet prompt always shows the approval amount.

### Files to Create/Modify
1. `src/utils/approval.ts` (new): presets, `parseLimit()` to validate custom input, `approvalAmount(paymentRaw, limitRaw)`.
2. `src/hooks/useSettings.ts`: add persisted `allowanceLimit` (default $100) and setter; keep notification rules untouched.
3. `src/hooks/useSocialPay.ts`: approve `approvalAmount(intent.raw, limit)` instead of `intent.raw` (existing `allowance >= raw` check already skips unnecessary approvals).
4. `src/components/settings/ApprovalCard.tsx` (new): limit picker, custom input with validation, remaining on-chain allowance, Revoke with status/errors.
5. `src/components/SettingsView.tsx`: render the card under the contract card.
6. `src/components/PayView.tsx`: preview shows "No approval needed" or "You'll approve up to $X once".
7. `tests/unit/approval.test.ts` (new): approval amount rule and custom limit parsing.

### Build Sequence
1. Add `src/utils/approval.ts` with unit tests (exact mode, payment below limit, payment above limit, invalid/oversized custom input, 6-decimal precision).
2. Extend `useSettings` with the limit setting.
3. Change `useSocialPay` to use the new approval amount.
4. Build `ApprovalCard` and add it to `SettingsView` (live allowance read, Revoke).
5. Add the approval hint to the `PayView` preview.
6. Run lint, typecheck and unit tests; rebuild and restart the preview.

### Done When
- [ ] With a $100 limit and no allowance, a $5 payment approves $100 once, then sends the payment.
- [ ] A second $5 payment is a single transaction with no approval prompt.
- [ ] A payment above the remaining allowance prompts one new approval for `max(payment, limit)`.
- [ ] "Exact" restores approve-per-payment.
- [ ] Settings shows the contract's remaining allowance and Revoke sets it to 0.
- [ ] Custom limits reject invalid values and persist across reloads.
- [ ] Unit tests, lint, typecheck and production build pass.
