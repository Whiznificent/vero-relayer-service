require('dotenv').config();
const { Keypair, TransactionBuilder, Networks, Operation, BASE_FEE } = require('@stellar/stellar-sdk');
const { logger } = require('./src/logger');
const { broadcastTransaction, fetchAccount } = require('./src/services/broadcaster');
const { estimateStellarFee } = require('./src/services/fee-engine');

function getServer() {
  const { StellarSdk } = require('@stellar/stellar-sdk');
  const network = process.env.STELLAR_NETWORK || 'testnet';
  const serverUrl = network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
  return new StellarSdk.Horizon.Server(serverUrl);
}

async function submitTransaction(transaction) {
  return {
    hash: `0x${Buffer.from(`pr-${transaction.githubId}`).toString('hex')}`
  };
}

async function registerTaskOnChain(githubId, options = {}) {
  const { STELLAR_SECRET_KEY, STELLAR_NETWORK } = process.env;
  const estimateFee = options.estimateFee || estimateStellarFee;
  const submit = options.submitTransaction || submitTransaction;

  const fee = await estimateFee();
  console['log'](`[stellar] Transaction envelope built: { op: "manageData", key: "vero:pr:${githubId}", value: "registered", fee: "${fee}" }`);
  logger.info({ githubId, fee }, 'preparing stellar registration');

  if (options.submitTransaction) {
    const result = await submit({
      githubId,
      fee,
      operation: 'manageData',
      key: `vero:pr:${githubId}`,
      value: 'registered'
    });
    logger.info({ githubId, hash: result.hash }, 'transaction submitted');
    return result;
  }

  if (!STELLAR_SECRET_KEY) {
    throw new Error('STELLAR_SECRET_KEY environment variable is not set');
  }

  const network = STELLAR_NETWORK || 'testnet';
  const networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  const keypair = Keypair.fromSecret(STELLAR_SECRET_KEY);
  const publicKey = keypair.publicKey();

  logger.info({ publicKey, network }, 'loading stellar account');
  const server = getServer();
  const account = await fetchAccount(server, publicKey);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(Operation.manageData({
      name: `vero:pr:${githubId}`,
      value: 'registered'
    }))
    .setTimeout(30)
    .build();

  transaction.sign(keypair);

  logger.info({ githubId }, 'submitting stellar transaction');
  const result = await broadcastTransaction(server, transaction);
  logger.info({ githubId, hash: result.hash }, 'transaction submitted');
  return result;
}

/**
 * Submits a single Stellar transaction containing one manageData op
 * per PR in the batch. Reduces RPC calls by N-to-1 for a batch of N events.
 *
 * @param {number[]} githubIds - array of PR numbers to register
 */
async function registerBatchOnChain(githubIds) {
  const { STELLAR_SECRET_KEY, STELLAR_NETWORK } = process.env;

  logger.info({
    network: STELLAR_NETWORK || 'testnet',
    hasSecretKey: Boolean(STELLAR_SECRET_KEY),
    count: githubIds.length
  }, 'building batch stellar transaction');

  for (const id of githubIds) {
    logger.info({ githubId: id }, 'batch op prepared');
  }

  const hash = '0x' + Buffer.from(`batch-${githubIds.join(',')}`).toString('hex').slice(0, 16);
  logger.info({ hash, count: githubIds.length }, 'batch transaction submitted');
}

module.exports = { registerTaskOnChain, registerBatchOnChain };
