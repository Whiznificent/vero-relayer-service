# vero-relayer-service

> **The Glue.** A Node.js backend that watches GitHub and triggers the Soroban contract — automatically.

---

## Overview

The Vero Relayer is a lightweight Express server that bridges GitHub activity and the Stellar blockchain. It listens for incoming GitHub Webhooks and, whenever a Pull Request tagged `wave-contribution` is merged, it calls the `register_task` function on the **Vero Core Contract** deployed on Soroban.

No manual steps. No copy-pasting transaction hashes. The moment a contributor's work is merged, it's on-chain.

---

## Architecture

```
GitHub Org
    │
    │  POST /github-webhook  (HMAC-verified)
    ▼
┌─────────────────────────────┐
│      vero-relayer-service   │
│                             │
│  index.js  ──►  stellar.js  │
│  (Express)      (Soroban)   │
└─────────────┬───────────────┘
              │  register_task(pr_number)
              ▼
     Vero Core Contract
     (Soroban / Testnet)
```

**Flow:**
1. A contributor opens a PR and a maintainer applies the `wave-contribution` label.
2. The PR is reviewed, approved, and merged.
3. GitHub fires a `pull_request` webhook event to this service.
4. The relayer verifies the HMAC signature, checks `action === 'closed' && merged === true`.
5. `stellar.js` builds and submits a Soroban transaction calling `register_task(pr_number)`.
6. The contract records the contribution on-chain, making it eligible for Wave Program rewards.

---

## Project Structure

```
vero-relayer-service/
├── index.js        # Express server + webhook handler
├── stellar.js      # Soroban transaction builder
├── package.json
├── .env.example    # Required environment variables
└── README.md
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your values
```

| Variable | Description |
|---|---|
| `RELAYER_SECRET_KEY` | Stellar secret key of the relayer account |
| `CONTRACT_ID` | Deployed Vero Core Contract address |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (testnet or mainnet) |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `GITHUB_WEBHOOK_SECRET` | Secret set in GitHub Webhook settings |
| `PORT` | Server port (default `3000`) |

### 3. Run

```bash
npm start          # production
npm run dev        # development (nodemon)
```

---

## Webhook Handler

```js
// index.js — core logic
app.post('/github-webhook', async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);

  const { action, pull_request } = req.body;

  if (action === 'closed' && pull_request?.merged) {
    const isWave = pull_request.labels.some(l => l.name === 'wave-contribution');
    if (isWave) {
      const txHash = await registerTaskOnChain(pull_request.number);
      console.log(`Registered PR #${pull_request.number} — TX: ${txHash}`);
    }
  }
  res.sendStatus(200);
});
```

All webhook payloads are verified using `HMAC-SHA256` against `GITHUB_WEBHOOK_SECRET` before any processing occurs.

---

## Soroban Integration

```js
// stellar.js — transaction builder
const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
  .addOperation(
    contract.call('register_task', nativeToScVal(prNumber, { type: 'u32' }))
  )
  .setTimeout(30)
  .build();

const preparedTx = await server.prepareTransaction(tx);
preparedTx.sign(keypair);
await server.sendTransaction(preparedTx);
```

---

## Deployment

Deploy to any Node.js-compatible host (Render, Railway, Fly.io):

1. Set all environment variables from `.env.example` in your host's dashboard.
2. Point your GitHub Organization's Webhook to `https://<your-host>/github-webhook`.
3. Set the content type to `application/json` and paste your `GITHUB_WEBHOOK_SECRET`.

### Final Setup (MentorsMind Step)

1. Create the GitHub Org and the three repos (`vero-core-contracts`, `vero-relayer-service`, `vero-frontend`).
2. Install the **Drips Wave App** on the Org.
3. Claim the Org on [drips.network/wave](https://drips.network/wave).
4. Add `FUNDING.json` to the root of `vero-core-contracts` so Drips can verify your treasury.

---

## Health Check

```
GET /health  →  { "status": "ok" }
```

---

## License

MIT
