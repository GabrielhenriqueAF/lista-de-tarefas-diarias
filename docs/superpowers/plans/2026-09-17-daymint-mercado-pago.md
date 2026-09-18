# Daymint Mercado Pago Sandbox and Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace simulated checkout with a Mercado Pago sandbox integration that handles card subscriptions and manual Pix/boleto renewals through verified, idempotent webhooks.

**Architecture:** `MercadoPagoProvider` implements the payment-provider port introduced by the development-payments plan. The API creates provider objects through server-side `fetch`, opens only the hosted URL in the client, and treats Mercado Pago’s authoritative resource lookup as the source of payment state. Webhook notification payloads are never trusted without verification.

**Tech Stack:** Node.js 24 native `fetch`, Fastify, PostgreSQL, Mercado Pago Sandbox, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-daymint-platform-design.md`

## Global Constraints

- Complete the development-payment plan before this plan.
- Use sandbox credentials first; production credentials and public HTTPS endpoint require a separate explicit release decision.
- Keep `MP_ACCESS_TOKEN` and webhook secret in server `.env` only.
- Card is the automatic-renewal path; Pix and boleto grant a paid period only after each approved payment.
- The client never calls Mercado Pago directly with a private token and never grants access based on its own callback URL.

---

### Task 1: Add Mercado Pago server configuration and HTTP client

**Files:**
- Modify: `server/src/config.js`
- Create: `server/src/payments/mercado-pago-client.js`
- Create: `server/tests/payments/mercado-pago-client.test.js`
- Modify: `.env.example`

**Interfaces:**
- Produces `createMercadoPagoClient({ accessToken, baseUrl, fetch }): { createSubscription, createManualCharge, getPayment, getSubscription }`.
- Configuration produces `mercadoPago: { accessToken, webhookSecret, baseUrl } | null`.
- `baseUrl` defaults to `https://api.mercadopago.com` and test code injects a fake `fetch`.

- [ ] **Step 1: Write failing client tests for private authorization and idempotency**

```js
await client.createManualCharge({ externalReference: 'attempt-1', amountCents: 1990, method: 'pix' });
expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/orders'), expect.objectContaining({
  headers: expect.objectContaining({ Authorization: 'Bearer sandbox-token', 'X-Idempotency-Key': expect.any(String) })
}));
expect(JSON.parse(fetch.mock.calls[0][1].body).external_reference).toBe('attempt-1');
```

- [ ] **Step 2: Run client tests and verify they fail**

Run: `npm test -- --run tests/payments/mercado-pago-client.test.js` from `server/`.

Expected: FAIL because the Mercado Pago client does not exist.

- [ ] **Step 3: Implement the server-only Mercado Pago client**

Translate cents to a decimal BRL string only at the provider boundary. `createSubscription` uses the Mercado Pago subscriptions API and requests monthly recurrence; `createManualCharge` uses the Orders API with `processing_mode: 'automatic'` and an external reference equal to the Daymint payment attempt ID. Both methods return normalized `{ providerReference, checkoutUrl, status }` values. Reject non-2xx responses with a sanitized `PAYMENT_PROVIDER_ERROR` that omits secrets and raw provider body.

- [ ] **Step 4: Add sandbox variables to the example file**

```dotenv
MP_ACCESS_TOKEN=TEST-replace-with-mercado-pago-sandbox-token
MP_WEBHOOK_SECRET=replace-with-mercado-pago-webhook-secret
MP_API_BASE_URL=https://api.mercadopago.com
```

- [ ] **Step 5: Run focused client tests**

Run: `npm test -- --run tests/payments/mercado-pago-client.test.js` from `server/`.

Expected: PASS.

- [ ] **Step 6: Commit the provider client**

```bash
git add server/src/config.js server/src/payments/mercado-pago-client.js server/tests/payments/mercado-pago-client.test.js .env.example
git commit -m "feat: add Mercado Pago server client"
```

### Task 2: Implement card subscription and manual Pix/boleto checkout routing

**Files:**
- Create: `server/src/payments/mercado-pago-provider.js`
- Create: `server/tests/payments/mercado-pago-provider.test.js`
- Modify: `server/src/billing/billing-service.js`
- Modify: `server/tests/billing/billing-routes.test.js`

**Interfaces:**
- `MercadoPagoProvider.createCheckout({ attemptId, plan, method, returnUrl })` returns a hosted checkout URL.
- Method `card` creates monthly subscription intent; `pix` and `boleto` create manual payment intent for the current period.
- `lookupEvent(reference)` returns normalized `approved`, `pending`, `rejected`, `cancelled`, or `expired` state.

- [ ] **Step 1: Write failing provider behavior tests**

```js
await provider.createCheckout({ attemptId: 'a-1', plan: PRO_PLAN, method: 'card', returnUrl: 'https://app.example/return' });
expect(client.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ frequency: 1, frequencyType: 'months' }));

await provider.createCheckout({ attemptId: 'a-2', plan: PRO_PLAN, method: 'boleto', returnUrl: 'https://app.example/return' });
expect(client.createManualCharge).toHaveBeenCalledWith(expect.objectContaining({ method: 'boleto' }));
```

- [ ] **Step 2: Run provider tests and verify they fail**

Run: `npm test -- --run tests/payments/mercado-pago-provider.test.js` from `server/`.

Expected: FAIL because the provider adapter does not exist.

- [ ] **Step 3: Implement explicit method behavior**

Reject methods outside `card`, `pix`, and `boleto` with HTTP 422. Store the Mercado Pago resource ID in `payment_attempts.provider_reference`. Do not infer approval from the return URL; store all new attempts as `pending` until Task 3 processes a verified provider event.

- [ ] **Step 4: Run provider and billing-route tests**

Run: `npm test -- --run tests/payments/mercado-pago-provider.test.js tests/billing/billing-routes.test.js` from `server/`.

Expected: PASS.

- [ ] **Step 5: Commit checkout provider behavior**

```bash
git add server/src/payments/mercado-pago-provider.js server/tests/payments/mercado-pago-provider.test.js server/src/billing/billing-service.js server/tests/billing/billing-routes.test.js
git commit -m "feat: route Daymint checkout through Mercado Pago"
```

### Task 3: Verify Mercado Pago webhooks before changing entitlements

**Files:**
- Create: `server/src/webhooks/mercado-pago-webhook.js`
- Create: `server/src/webhooks/webhook-routes.js`
- Create: `server/tests/webhooks/mercado-pago-webhook.test.js`
- Create: `server/tests/webhooks/webhook-routes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Exposes `POST /webhooks/mercado-pago`.
- Produces `processMercadoPagoNotification(notification): Promise<{ alreadyProcessed, status }>`.
- Consumes `MercadoPagoProvider.lookupEvent` and `billingService.applyApprovedPayment`.

- [ ] **Step 1: Write failing tests for verified approval, pending, and duplicate events**

```js
it('grants Pro only after provider lookup confirms approval', async () => {
  provider.lookupEvent.mockResolvedValue({ providerEventId: 'mp-9', reference: 'attempt-9', status: 'approved', paidAt: '2026-09-17T18:00:00Z' });
  const response = await app.inject({ method: 'POST', url: '/webhooks/mercado-pago', payload: notification });
  expect(response.statusCode).toBe(204);
  expect(await billingStatus(workspaceId)).toMatchObject({ planCode: 'pro' });
});

it('does not grant Pro for a pending notification', async () => {
  provider.lookupEvent.mockResolvedValue({ providerEventId: 'mp-10', reference: 'attempt-10', status: 'pending' });
  await app.inject({ method: 'POST', url: '/webhooks/mercado-pago', payload: notification });
  expect(await billingStatus(workspaceId)).toMatchObject({ planCode: 'free' });
});
```

- [ ] **Step 2: Run webhook tests and verify they fail**

Run: `npm test -- --run tests/webhooks` from `server/`.

Expected: FAIL because webhook processor and route do not exist.

- [ ] **Step 3: Implement verification and idempotency**

Validate the signed notification when Mercado Pago configuration provides a webhook secret. Independently fetch the referenced provider resource and match its external reference to an existing Daymint attempt. Register `(provider, provider_event_id)` first inside a transaction. Only a verified `approved` state calls `applyApprovedPayment`; pending and failed states only update the attempt. Return `204` for accepted duplicate delivery and `400` for malformed data.

- [ ] **Step 4: Run webhook, billing, and full server tests**

Run: `npm test -- --run tests/webhooks tests/billing`, then `npm test -- --run` from `server/`.

Expected: PASS; no test sends traffic to Mercado Pago.

- [ ] **Step 5: Commit webhook protection**

```bash
git add server/src/webhooks server/tests/webhooks server/src/app.js
git commit -m "feat: verify Mercado Pago payment webhooks"
```

### Task 4: Run a sandbox-only manual acceptance checklist

**Files:**
- Create: `docs/mercado-pago-sandbox.md`
- Modify: `README.md`

**Interfaces:**
- Documents the exact variables, URLs, and expected statuses needed for a human sandbox check.
- Does not commit credentials, test cards, personal identification numbers, or webhook secrets.

- [ ] **Step 1: Document the sandbox prerequisites**

Record: seller sandbox account, sandbox access token in local `.env`, HTTPS tunnel URL for webhook delivery, and the current official Mercado Pago documentation links. Mark every value as local-only and direct the reader to `.env.example` for variable names.

- [ ] **Step 2: Document acceptance scenarios**

Include separate steps and expected outcomes for card subscription approved, Pix pending then approved, boleto pending then approved, duplicate webhook delivery, rejected payment, cancelled checkout, and missing webhook secret. Each scenario must verify Daymint billing status rather than trusting browser return pages.

- [ ] **Step 3: Add a README link and run tests**

Run: `npm test -- --run` from `server/` and from the repository root.

Expected: both suites PASS before any human sandbox action.

- [ ] **Step 4: Commit sandbox runbook**

```bash
git add docs/mercado-pago-sandbox.md README.md
git commit -m "docs: add Mercado Pago sandbox runbook"
```
