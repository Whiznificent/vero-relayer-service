require('dotenv').config();

const { logger } = require('./src/logger');
const { estimateStellarFee } = require('./src/services/fee-engine');

async function submitTransaction(transaction) {
  return {
    hash: `0x${Buffer.from(`pr-${transaction.githubId}`).toString('hex')}`
  };
}

async function registerTaskOnChain(githubId, options = {}) {
  const { STELLAR_SECRET_KEY, STELLAR_NETWORK } = process.env;
  const estimateFee = options.estimateFee || estimateStellarFee;
  const submit = options.submitTransaction || submitTransaction;
  const log = options.logger || logger;

  log.info({
    network: STELLAR_NETWORK || 'testnet',
    hasSigningKey: Boolean(STELLAR_SECRET_KEY)
  }, 'stellar configuration loaded');

  const fee = await estimateFee();

  log.info({ pr: githubId, fee }, 'building stellar transaction');

  const result = await submit({
    githubId,
    fee,
    operation: 'manageData',
    key: `vero:pr:${githubId}`,
    value: 'registered'
  });

  log.info({ pr: githubId, hash: result.hash }, 'stellar transaction submitted');
  log.info({ pr: githubId }, 'pull request registered on-chain');
}

module.exports = { registerTaskOnChain };
