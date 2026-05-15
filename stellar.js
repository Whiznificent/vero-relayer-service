const { Keypair, TransactionBuilder, Networks, Operation, Contract, nativeToScVal, BASE_FEE } = require('@stellar/stellar-sdk');
const { Server } = require('@stellar/stellar-sdk/rpc');

const server = new Server(process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org');
const networkPassphrase = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

/**
 * Registers a merged PR as a task on the Vero Core Contract.
 * @param {number} prNumber - The GitHub PR number to register.
 * @returns {Promise<string>} The transaction hash.
 */
async function registerTaskOnChain(prNumber) {
  const keypair = Keypair.fromSecret(process.env.RELAYER_SECRET_KEY);
  const account = await server.getAccount(keypair.publicKey());
  const contract = new Contract(process.env.CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call('register_task', nativeToScVal(prNumber, { type: 'u32' }))
    )
    .setTimeout(30)
    .build();

  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(keypair);

  const result = await server.sendTransaction(preparedTx);
  if (result.status === 'ERROR') throw new Error(result.errorResult?.toString());

  return result.hash;
}

module.exports = { registerTaskOnChain };
