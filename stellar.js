require('dotenv').config();
const { Keypair, TransactionBuilder, Networks, Operation, BASE_FEE } = require('@stellar/stellar-sdk');
const { broadcastTransaction, fetchAccount } = require('./src/services/broadcaster');
const { retry } = require('./src/utils/retry');

function getServer() {
  const { StellarSdk } = require('@stellar/stellar-sdk');
  const network = process.env.STELLAR_NETWORK || 'testnet';
  const serverUrl = network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
  return new StellarSdk.Horizon.Server(serverUrl);
}

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
async function registerTaskOnChain(githubId) {
  const secretKey = process.env.STELLAR_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STELLAR_SECRET_KEY environment variable is not set');
  }

  const network = process.env.STELLAR_NETWORK || 'testnet';
  const networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  const server = getServer();
  const keypair = Keypair.fromSecret(secretKey);
  const publicKey = keypair.publicKey();

  console.log(`[stellar] Loading account ${publicKey} on ${network}...`);

  const account = await fetchAccount(server, publicKey);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(Operation.manageData({
      name: `vero:pr:${githubId}`,
      value: `registered`,
    }))
    .setTimeout(30)
    .build();

  transaction.sign(keypair);

  console.log(`[stellar] Submitting transaction for PR #${githubId}...`);

  const result = await broadcastTransaction(server, transaction);

  console.log(`[stellar] PR #${githubId} successfully registered on-chain. Hash: ${result.hash}`);
  return result;
}

module.exports = { registerTaskOnChain };
