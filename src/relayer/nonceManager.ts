
import pool from '../db/client';
import { logger } from '../logger';

/**
 * Creates a 64-bit advisory lock key from an account ID string.
 * Uses a simple hash function to convert the Stellar account ID (G...)
 * into a number suitable for pg_advisory_lock.
 */
function accountToLockKey(accountId: string): number {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  // Ensure we get a positive 64-bit compatible number
  return Math.abs(hash);
}

/**
 * Nonce Manager ensures atomic nonce fetching and sequential transaction submission
 * using PostgreSQL advisory locks to serialize access per account.
 */
class NonceManager {
  /**
   * Executes a transaction with guaranteed sequential nonce ordering for the given account.
   * @param accountId - Stellar account ID to lock on
   * @param fetchAccountFn - Function to fetch the latest account from Horizon
   * @param buildAndSubmitFn - Function that takes the account and submits the transaction
   */
  async withSequentialNonce<T>(
    accountId: string,
    fetchAccountFn: () => Promise<any>,
    buildAndSubmitFn: (account: any) => Promise<T>
  ): Promise<T> {
    const lockKey = accountToLockKey(accountId);
    const client = await pool.connect();

    try {
      logger.debug({ accountId, lockKey }, '[nonceManager] Acquiring advisory lock');
      await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
      logger.debug({ accountId, lockKey }, '[nonceManager] Advisory lock acquired');

      // Fetch latest account from Horizon while holding the lock
      const account = await fetchAccountFn();
      logger.debug({ accountId, sequence: account.sequence }, '[nonceManager] Fetched latest nonce');

      // Build and submit transaction
      const result = await buildAndSubmitFn(account);

      logger.debug({ accountId, lockKey }, '[nonceManager] Transaction submitted, releasing lock');
      return result;
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
        logger.debug({ accountId, lockKey }, '[nonceManager] Advisory lock released');
      } catch (unlockError) {
        logger.error({ error: unlockError, accountId, lockKey }, '[nonceManager] Failed to release advisory lock');
      } finally {
        client.release();
      }
    }
  }
}

export default new NonceManager();
