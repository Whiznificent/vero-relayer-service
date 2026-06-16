const assert = require('node:assert/strict');
const { test } = require('node:test');
const { registerTaskOnChain } = require('../stellar');

function captureLogger(entries) {
  return {
    info: (context, message) => entries.push({ level: 'info', context, message }),
    error: (context, message) => entries.push({ level: 'error', context, message }),
    warn: (context, message) => entries.push({ level: 'warn', context, message }),
    debug: (context, message) => entries.push({ level: 'debug', context, message }),
    child() {
      return this;
    }
  };
}

test('registerTaskOnChain estimates fee before transaction submission', async () => {
  const calls = [];
  const logs = [];

  await registerTaskOnChain(42, {
    logger: captureLogger(logs),
    estimateFee: async () => {
      calls.push('estimateFee');
      return '777';
    },
    submitTransaction: async transaction => {
      calls.push(`submit:${transaction.fee}`);
      return { hash: '0xtest' };
    }
  });

  assert.deepEqual(calls, ['estimateFee', 'submit:777']);
  assert.ok(logs.some(entry => entry.context && entry.context.fee === '777'));
  assert.ok(!logs.some(entry => entry.context && entry.context.fee === '100'));
});

test('registerTaskOnChain does not submit when fee estimation throws a configuration error', async () => {
  const calls = [];

  await assert.rejects(
    () => registerTaskOnChain(42, {
      logger: captureLogger([]),
      estimateFee: async () => {
        calls.push('estimateFee');
        throw new Error('invalid fee config');
      },
      submitTransaction: async () => {
        calls.push('submit');
        return { hash: '0xtest' };
      }
    }),
    /invalid fee config/
  );

  assert.deepEqual(calls, ['estimateFee']);
});
