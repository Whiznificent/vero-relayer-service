require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { registerTaskOnChain } = require('./stellar');

const app = express();
app.use(express.json());

// Verify GitHub webhook signature
function verifySignature(req) {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig || !process.env.GITHUB_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(digest));
}

app.post('/github-webhook', async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);

  const { action, pull_request } = req.body;

  if (action === 'closed' && pull_request?.merged) {
    const isWave = pull_request.labels.some(l => l.name === 'wave-contribution');
    if (isWave) {
      console.log(`[Relayer] Registering PR #${pull_request.number} on Soroban...`);
      try {
        const txHash = await registerTaskOnChain(pull_request.number);
        console.log(`[Relayer] Registered. TX: ${txHash}`);
      } catch (err) {
        console.error(`[Relayer] Failed to register PR #${pull_request.number}:`, err.message);
        return res.sendStatus(500);
      }
    }
  }

  res.sendStatus(200);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Relayer active on port ${PORT}`));
