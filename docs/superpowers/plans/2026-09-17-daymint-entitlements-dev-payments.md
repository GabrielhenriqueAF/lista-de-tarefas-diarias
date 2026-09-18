# Daymint Entitlements and Development Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Free/Pro limits per Workspace, provide a branded billing experience, and safely exercise approval flows with a development-only payment provider.

**Architecture:** Billing owns a small plan catalog, subscription state, payment attempts, webhook idempotency, and entitlement checks. Routine creation calls Billing before persistence. The desktop shows billing state but never makes the authorization decision; only the server can grant Pro after a provider event.

**Tech Stack:** Existing Electron renderer, Daymint API, PostgreSQL, Fastify, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-daymint-platform-design.md`

## Global Constraints

- Free permits 15 active items; Pro costs R$ 19,90/month and permits 50 active items.
- An active item is one active recurrence rule or one planned/in-progress ad-hoc block.
- Existing data is never deleted on a downgrade or limit violation.
- The development approval endpoint exists only when `NODE_ENV=development`, requires a development token, and accepts only localhost traffic.
- The front-end contains no access token, card number, CVV, or plan-grant logic.

---

### Task 1: Add plan, subscription, and payment-attempt persistence

**Files:**
- Create: `server/src/database/migrations/003_billing.sql`
- Create: `server/src/billing/billing-repository.js`
- Create: `server/src/billing/plan-catalog.js`
- Create: `server/tests/billing/billing-repository.test.js`

**Interfaces:**
- Produces `FREE_PLAN = { code: 'free', activeItemLimit: 15, priceCents: 0 }`.
- Produces `PRO_PLAN = { code: 'pro', activeItemLimit: 50, priceCents: 1990, currency: 'BRL', interval: 'month' }`.
- Produces repository methods `getSubscription`, `upsertSubscription`, `createPaymentAttempt`, and `recordWebhookEvent`.

- [ ] **Step 1: Write failing catalog and idempotency tests**

```js
expect(planCatalog.get('free')).toMatchObject({ activeItemLimit: 15, priceCents: 0 });
expect(planCatalog.get('pro')).toMatchObject({ activeItemLimit: 50, priceCents: 1990, currency: 'BRL' });
await repository.recordWebhookEvent({ provider: 'dev', providerEventId: 'evt-1', payload: { status: 'approved' } });
await expect(repository.recordWebhookEvent({ provider: 'dev', providerEventId: 'evt-1', payload: {} }))
  .resolves.toMatchObject({ alreadyProcessed: true });
```

- [ ] **Step 2: Run billing persistence tests and verify they fail**

Run: `npm test -- --run tests/billing/billing-repository.test.js` from `server/`.

Expected: FAIL because migration 003 and billing modules do not exist.

- [ ] **Step 3: Implement migration 003 and immutable catalog**

Create `plans`, `subscriptions`, `payment_attempts`, `webhook_events`, and `entitlement_audit_events`. Use integer cents, `currency CHAR(3)`, unique `(provider, provider_event_id)`, and a `workspace_id` foreign key on every billing record. Seed Free and Pro with `INSERT ... ON CONFLICT (code) DO UPDATE` only for catalog metadata; do not overwrite a customer subscription.

- [ ] **Step 4: Run billing persistence tests**

Run: `npm test -- --run tests/billing/billing-repository.test.js` from `server/`.

Expected: PASS and duplicate webhook registration remains a no-op.

- [ ] **Step 5: Commit billing data model**

```bash
git add server/src/database/migrations/003_billing.sql server/src/billing/plan-catalog.js server/src/billing/billing-repository.js server/tests/billing/billing-repository.test.js
git commit -m "feat: add Daymint billing persistence"
```

### Task 2: Implement entitlement calculation and routine-limit enforcement

**Files:**
- Create: `server/src/billing/entitlement-service.js`
- Create: `server/tests/billing/entitlement-service.test.js`
- Modify: `server/src/routines/routine-service.js`
- Modify: `server/tests/routines/routine-routes.test.js`

**Interfaces:**
- Produces `getEntitlements(workspaceId): { planCode, activeItemLimit, activeItemCount, features, periodEndsAt }`.
- Produces `assertCanCreateRoutineItem(workspaceId): Promise<void>`.
- `createRule` and `createAdHocBlock` call `assertCanCreateRoutineItem` before writing.

- [ ] **Step 1: Write failing boundary tests at 15 and 50 items**

```js
await seedActiveRules(workspaceId, 15);
await expect(entitlements.assertCanCreateRoutineItem(workspaceId)).rejects.toMatchObject({
  code: 'ACTIVE_ITEM_LIMIT_REACHED', statusCode: 403
});
await activatePro(workspaceId);
await seedActiveRules(workspaceId, 49);
await expect(entitlements.assertCanCreateRoutineItem(workspaceId)).resolves.toBeUndefined();
```

- [ ] **Step 2: Run entitlement tests and verify they fail**

Run: `npm test -- --run tests/billing/entitlement-service.test.js` from `server/`.

Expected: FAIL because entitlement service does not exist.

- [ ] **Step 3: Implement exact active-item counting**

Count active `recurrence_rules` plus `blocks` where `recurrence_rule_id IS NULL` and `status IN ('planned', 'in_progress')`. Use the current effective subscription only when its status is `active` and `current_period_end > now()`; otherwise use Free. Do not count completed/cancelled blocks or materialized blocks belonging to a rule.

- [ ] **Step 4: Add API-level tests for a blocked sixteenth item**

Ensure `POST /workspaces/:workspaceId/rules` returns HTTP 403 with `{ error: { code: 'ACTIVE_ITEM_LIMIT_REACHED', message: 'Seu plano atual permite até 15 itens ativos.' } }`, while listing and finishing old items remain successful.

- [ ] **Step 5: Run full server tests**

Run: `npm test -- --run` from `server/`.

Expected: PASS.

- [ ] **Step 6: Commit entitlement enforcement**

```bash
git add server/src/billing/entitlement-service.js server/tests/billing/entitlement-service.test.js server/src/routines/routine-service.js server/tests/routines/routine-routes.test.js
git commit -m "feat: enforce Daymint plan limits"
```

### Task 3: Add a provider abstraction and development-only approval flow

**Files:**
- Create: `server/src/payments/payment-provider.js`
- Create: `server/src/payments/dev-payment-provider.js`
- Create: `server/src/billing/billing-service.js`
- Create: `server/src/billing/billing-routes.js`
- Create: `server/tests/payments/dev-payment-provider.test.js`
- Create: `server/tests/billing/billing-routes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- `PaymentProvider.createCheckout({ workspaceId, attemptId, plan, method, returnUrl }): Promise<{ checkoutUrl, providerReference }>`.
- `PaymentProvider.lookupEvent(providerReference): Promise<{ providerEventId, reference, status, paidAt }>`; `reference` is the Daymint payment-attempt ID returned by the provider.
- Exposes `GET /workspaces/:workspaceId/billing/status`, `GET /workspaces/:workspaceId/billing/history`, and `POST /workspaces/:workspaceId/billing/checkout`.
- Exposes `POST /internal/dev/payments/:attemptId/approve` only under development configuration.

- [ ] **Step 1: Write failing provider and route tests**

```js
it('does not register the development approval route in production', async () => {
  const app = createApp({ config: { nodeEnv: 'production' }, repositories, paymentProvider });
  expect(app.printRoutes()).not.toContain('/internal/dev/payments');
  await app.close();
});

it('grants Pro only after a simulated approved event', async () => {
  const attempt = await startDevCheckout(ownerToken);
  await approveDevAttempt(attempt.id, devToken);
  expect(await billingStatus(workspaceId)).toMatchObject({ planCode: 'pro', activeItemLimit: 50 });
});
```

- [ ] **Step 2: Run development-payment tests and verify they fail**

Run: `npm test -- --run tests/payments/dev-payment-provider.test.js tests/billing/billing-routes.test.js` from `server/`.

Expected: FAIL because the provider abstraction and billing routes do not exist.

- [ ] **Step 3: Implement the payment provider port and DevPaymentProvider**

Generate attempts with `method` restricted to `card`, `pix`, or `boleto`, but return a local simulated checkout URL rather than financial data. Approval must pass through the same `billingService.applyApprovedPayment` method used later by Mercado Pago. That method must record the provider event before extending a subscription, preventing duplicate grants.

- [ ] **Step 4: Restrict the development endpoint**

Reject the request unless all conditions hold: `NODE_ENV === 'development'`, remote address is loopback, `X-Daymint-Dev-Token` matches the configured secret using timing-safe comparison, and the attempt exists in the caller’s Workspace. Do not include this route at all in test production app creation.

- [ ] **Step 5: Run focused tests and full server tests**

Run: `npm test -- --run tests/payments/dev-payment-provider.test.js tests/billing/billing-routes.test.js`, then `npm test -- --run` from `server/`.

Expected: PASS.

- [ ] **Step 6: Commit test-only checkout support**

```bash
git add server/src/payments server/src/billing/billing-service.js server/src/billing/billing-routes.js server/src/app.js server/tests/payments server/tests/billing/billing-routes.test.js
git commit -m "feat: simulate Daymint payment approvals"
```

### Task 4: Add Billing UI for status, upgrade, and local demonstration

**Files:**
- Create: `src/renderer/views/billing-view.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles.css`
- Modify: `src/preload.js`
- Create: `tests/renderer/billing-view.test.js`
- Modify: `tests/main/preload.test.js`

**Interfaces:**
- Exposes `window.daymintApi.billing.status(workspaceId)`, `.history(workspaceId)`, and `.createCheckout(workspaceId, method)`.
- Produces `renderBillingView(root, model)`.
- Adds an account/billing navigation item only after the desktop is connected to a remote Workspace.

- [ ] **Step 1: Write a failing renderer test for Free and Pro states**

```js
renderBillingView(root, { planCode: 'free', activeItemCount: 15, activeItemLimit: 15, priceCents: 1990 });
expect(root.textContent).toContain('15 de 15 itens ativos');
expect(root.querySelector('[data-action="upgrade-pro"]')).not.toBeNull();
```

- [ ] **Step 2: Run renderer/preload tests and verify they fail**

Run: `npm test -- --run tests/renderer/billing-view.test.js tests/main/preload.test.js` from the repository root.

Expected: FAIL because Billing view and bridge methods do not exist.

- [ ] **Step 3: Implement a Daymint-branded safe billing experience**

Render Free and Pro cards, `R$ 19,90/mês`, active-item meter, current period end, payment history, and three method choices. Clicking a method creates a checkout through the API and opens only the returned URL through `shell.openExternal`; no card field appears in the Electron renderer. The dev checkout page must label itself “Ambiente de desenvolvimento” and offer fixture data under “Drumond Demo”, never a real account.

- [ ] **Step 4: Run focused and full desktop tests**

Run: `npm test -- --run tests/renderer/billing-view.test.js tests/main/preload.test.js`, then `npm test -- --run` from the repository root.

Expected: PASS.

- [ ] **Step 5: Commit Daymint billing UI**

```bash
git add src/renderer/views/billing-view.js src/renderer/index.html src/renderer/app.js src/renderer/styles.css src/preload.js tests/renderer/billing-view.test.js tests/main/preload.test.js
git commit -m "feat: add Daymint billing interface"
```
