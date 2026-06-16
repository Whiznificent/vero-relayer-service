const { logger } = require('../logger');

const MAX_RETRIES = 3;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class TransactionWatcher {
  constructor(db) {
    this.db = db || new Map();
  }

  async checkStalledTransactions() {
    const now = Date.now();
    let requeuedCount = 0;

    for (const [txId, tx] of this.db.entries()) {
      if (tx.status === 'pending' || tx.status === 'broadcasted') {
        const timeSinceSubmission = now - (tx.lastRetryAt || tx.submittedAt);
        
        if (timeSinceSubmission > TIMEOUT_MS) {
          if (tx.retries < MAX_RETRIES) {
            logger.info({ txId, retry: tx.retries + 1, maxRetries: MAX_RETRIES }, 'transaction stalled and re-queued');
            tx.status = 'requeued';
            tx.retries += 1;
            tx.lastRetryAt = now;
            requeuedCount++;
          } else {
            logger.warn({ txId, retries: tx.retries }, 'transaction stalled beyond max retries');
            tx.status = 'failed';
          }
          this.db.set(txId, tx);
        }
      }
    }
    
    return requeuedCount;
  }
}

module.exports = { TransactionWatcher, MAX_RETRIES, TIMEOUT_MS };
