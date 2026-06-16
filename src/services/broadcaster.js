const { logger } = require('../logger');
const { retry } = require('../utils/retry');

async function broadcastTransaction(server, transaction) {
  return retry(
    async (attempt) => {
      const result = await server.submitTransaction(transaction);
      if (!result.hash) {
        throw new Error('Transaction submission returned no hash');
      }
      return result;
    },
    {
      maxRetries: 3,
      baseDelay: 1000,
      onRetry: ({ attempt, delay, error }) => {
        logger.warn({ attempt: attempt + 1, delay, error: error.message }, 'broadcast retry');
      },
    }
  );
}

async function fetchAccount(server, accountId) {
  return retry(
    () => server.loadAccount(accountId),
    {
      maxRetries: 3,
      baseDelay: 500,
      onRetry: ({ attempt, delay, error }) => {
        logger.warn({ attempt: attempt + 1, delay, error: error.message }, 'account fetch retry');
      },
    }
  );
}

module.exports = { broadcastTransaction, fetchAccount };
