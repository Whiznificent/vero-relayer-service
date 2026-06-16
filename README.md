# Vero Relayer Service

A lightweight Node.js service that listens for GitHub webhook events and relays qualifying pull request activity onto the Stellar blockchain. It is the on-chain settlement layer for the **Wave Contribution Program**, a sprint-based open-source incentive model where maintainers post scoped issues and contributors earn verifiable on-chain records for their merged work.

---

## How It Works

```
GitHub PR merged
      |
      v
POST /github-webhook
      |
      |-- action === "closed"? skip if false
      |-- pull_request.merged === true? skip if false
      `-- labels includes "wave-contribution"? skip if false
                |
                v
      enqueue BullMQ job in Redis
                |
                v
      event worker calls registerTaskOnChain(pr.number)
                |
                v
      estimate Stellar fee from RPC getFeeStats p75
                |
                v
      Stellar transaction submitted
      (manageData: vero:pr:<number>)
```

When a contributor's PR is merged and carries the `wave-contribution` label, the relayer captures the PR number, persists an event job in Redis, and returns `202 Accepted`. A separate BullMQ worker drains the queue, estimates the current Stellar fee, and writes a `manageData` operation to Stellar.

---

## Quick Start

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
# Fill in STELLAR_SECRET_KEY, REDIS_PASSWORD, and STELLAR_RPC_URL
```

**3. Start Redis with password protection**
```bash
docker run --rm -p 6379:6379 redis:7-alpine redis-server --requirepass change-me
```

**4. Start the server**
```bash
npm start
# Server listening on port 3000
```

**5. Start the worker**
```bash
npm run worker:events
# [worker] status=started queue=vero:event-processing concurrency=5
```

**6. Simulate a webhook (no GitHub needed)**
```bash
npm run simulate
# [mock] Response: { ok: true, pr: 42, queued: true, jobId: "..." }
```

---

## Webhook Payload Contract

The service expects the standard GitHub `pull_request` event shape:

```json
{
  "action": "closed",
  "pull_request": {
    "number": 42,
    "merged": true,
    "labels": [
      { "name": "wave-contribution" }
    ]
  }
}
```

Any payload where `action` is not `closed`, `merged` is not `true`, or the label is absent is silently skipped with `{ "skipped": true }`.

Qualifying events return `202 Accepted` with `{ "ok": true, "pr": <number>, "queued": true, "jobId": "..." }` after the job is persisted to Redis.

---

## Project Structure

```
vero-relayer-service/
|-- index.js                    # Express server + webhook route
|-- stellar.js                  # Blockchain registration utility
|-- src/
|   |-- queue/                  # Redis/BullMQ queue configuration
|   |-- services/               # Stellar fee estimation
|   `-- workers/                # Event queue worker
|-- scripts/
|   `-- mock-webhook.js         # Local simulation script
|-- .env.example                # Required environment variables
`-- package.json
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LOG_LEVEL` | No | Pino log level, defaults to `info` |
| `LOG_REDACT_REMOVE` | No | Set to `true` to remove redacted fields instead of replacing with `[Redacted]` |
| `ENABLE_HTTP_REQUEST_LOGS` | No | Set to `false` to disable automatic request completion logs |
| `STELLAR_SECRET_KEY` | Yes | Signing key for the relayer account |
| `STELLAR_NETWORK` | No | `testnet` (default) or `mainnet` |
| `STELLAR_RPC_URL` | No | Stellar RPC URL used for fee stats |
| `STELLAR_BASE_FEE` | No | Fallback fee in stroops, defaults to `100` |
| `STELLAR_MIN_FEE` | No | Minimum fee in stroops, defaults to `100` |
| `STELLAR_MAX_FEE` | No | Maximum fee cap in stroops, defaults to `10000` |
| `STELLAR_FEE_PERCENTILE` | No | Fee percentile target, defaults to `p75` |
| `STELLAR_FEE_MULTIPLIER` | No | Decimal multiplier applied before caps, defaults to `1` |
| `STELLAR_FEE_CACHE_MS` | No | Optional short fee cache window, defaults to `0` |
| `REDIS_HOST` | Yes | Redis host for BullMQ |
| `REDIS_PORT` | Yes | Redis port for BullMQ |
| `REDIS_USERNAME` | No | Redis ACL username, when required by the provider |
| `REDIS_PASSWORD` | Production | Redis password; required when `NODE_ENV=production` |
| `REDIS_TLS` | No | Set to `true` to enable TLS |
| `EVENT_QUEUE_NAME` | No | Defaults to `vero:event-processing` |
| `EVENT_QUEUE_CONCURRENCY` | No | Worker concurrency, defaults to `5` |

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the production server |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run worker:events` | Start the BullMQ event worker |
| `npm run simulate` | Fire a mock webhook at localhost:3000 |
| `COUNT=125 npm run simulate` | Inject 125 mock webhooks |
| `npm test` | Run native Node.js tests |
| `npm run typecheck` | Type-check the fee engine |

---

## Manual Queue Verification

1. Start Redis with password protection:
   ```bash
   docker run --rm -p 6379:6379 redis:7-alpine redis-server --requirepass change-me
   ```
2. Set `.env` with `REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379`, and the same `REDIS_PASSWORD`.
3. Start the app with `npm start`.
4. In a second terminal, start the worker with `npm run worker:events`.
5. Inject a burst of events with `COUNT=125 npm run simulate`.
6. Confirm jobs enter Redis:
   ```bash
   docker exec -it <redis-container> redis-cli -a change-me LLEN bull:vero:event-processing:wait
   ```
7. Watch the worker logs for `status=started`, `status=completed`, and retry `status=failed` entries. Logs include job ID, event type, and attempt number, but do not include Redis passwords or request headers.
8. Stop the worker during a burst and restart it to confirm persisted jobs continue draining from Redis.

---

## Manual Fee Verification

1. Set `.env` with `STELLAR_RPC_URL`, `STELLAR_BASE_FEE`, `STELLAR_MIN_FEE`, `STELLAR_MAX_FEE`, `STELLAR_FEE_PERCENTILE=p75`, and `STELLAR_FEE_MULTIPLIER=1`.
2. Start the worker with `npm run worker:events`.
3. Send a qualifying webhook with `npm run simulate`.
4. Confirm logs include a fee line like `[fee] selected=<stroops> percentile=p75 min=<min> max=<max> source=<source>` before the transaction envelope log.
5. Simulate high-fee stats in tests with `npm test`; the fee engine tests mock `getFeeStats` p75 values and verify fee increases and max caps.
6. Lower `STELLAR_MAX_FEE` in a local `.env` and repeat a simulated high-fee test path to confirm the selected fee never exceeds the configured cap.

---

## Manual Logging Verification

1. Set `LOG_LEVEL=info` and `ENABLE_HTTP_REQUEST_LOGS=true` in `.env`.
2. Start the service with `npm start`.
3. Send a request with a request ID:
   ```bash
   curl -H "Content-Type: application/json" -H "x-request-id: demo-request-1" \
     -d "{\"action\":\"opened\"}" http://localhost:3000/github-webhook
   ```
4. Confirm terminal logs are JSON and include `time`, `level`, `message`, and `requestId`.
5. Confirm request completion logs include method, path, status code, duration, and request ID.
6. Trigger a safe enqueue error by stopping Redis and sending a qualifying webhook; confirm the error log contains an `err` object and request ID.
7. Confirm authorization headers, passwords, tokens, private keys, Stellar secret keys, and raw request bodies are not printed.
8. Search for direct console logging:
   ```bash
   rg "console\\.(log|warn|error|info|debug)" -g "!node_modules/**"
   ```
