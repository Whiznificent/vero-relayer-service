# Vero Relayer — Wave Program Contribution Plan

## What is the Wave Program?

The Wave Program is a structured open-source contribution model where maintainers post scoped, time-boxed issues and contributors pick them up during sprint cycles. Completed work is verified on-chain via the Vero Core Contract, making every merged contribution auditable and reward-eligible.

---

## How This Repo Participates

`vero-relayer-service` is the automation backbone of the Vero ecosystem. It is the piece that makes on-chain contribution tracking possible without any manual intervention. As such, it is a high-value target for Wave contributions — improvements here multiply the value of every other repo in the org.

---

## Types of Work We'll Post

### 1. Bug Fixes
- Webhook signature verification edge cases (empty body, replay attacks)
- Error handling when the Soroban RPC is unreachable or returns a non-`PENDING` status
- Race conditions when multiple PRs are merged in rapid succession

**Example issue:**
> `[Bug] Relayer crashes when pull_request.labels is undefined on re-opened PRs`

---

### 2. New Features
- **Retry logic** — exponential backoff when `sendTransaction` returns `TRY_AGAIN_LATER`
- **Event queue** — buffer webhook events to a lightweight queue (e.g., BullMQ) so the relayer survives RPC downtime
- **Multi-label support** — allow configurable label names via env var instead of hardcoded `wave-contribution`
- **Webhook replay endpoint** — `POST /replay/:pr_number` for manually re-triggering a missed registration

**Example issue:**
> `[Feature] Add exponential backoff retry for Soroban transaction submission`

---

### 3. Documentation
- Annotated walkthrough of the HMAC verification flow
- Step-by-step Render/Railway deployment guide with screenshots
- Explanation of the Soroban `prepareTransaction` → `sign` → `sendTransaction` lifecycle
- FAQ: "Why does my webhook return 401?" troubleshooting guide

**Example issue:**
> `[Docs] Write deployment guide for Railway with env var setup`

---

### 4. Testing
- Unit tests for `verifySignature` with valid, invalid, and missing signatures
- Unit tests for `registerTaskOnChain` using a mocked Soroban RPC server
- Integration test: fire a mock GitHub webhook payload and assert the correct contract call is made
- Test coverage reporting via `c8` or `nyc`

**Example issue:**
> `[Test] Add unit tests for verifySignature covering all edge cases`

---

### 5. DevOps / Infrastructure
- `Dockerfile` for containerised deployment
- GitHub Actions CI workflow: lint + test on every PR
- Health check endpoint improvements (include uptime, last registered PR, RPC latency)

**Example issue:**
> `[DevOps] Add Dockerfile and docker-compose for local development`

---

## Sprint Cadence

Issues will be opened at the start of each two-week sprint, tagged `wave-contribution`, and sized with effort labels (`XS`, `S`, `M`, `L`). Contributors claim an issue by commenting, and the maintainer assigns it within 24 hours. PRs must be opened before the sprint closes to be eligible for that cycle's rewards.

---

## Reward Eligibility

Every merged PR tagged `wave-contribution` is automatically registered on-chain by this very service. The on-chain record is what Drips uses to calculate reward distribution — no extra steps required for contributors.
