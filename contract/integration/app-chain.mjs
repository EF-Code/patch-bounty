import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Worker} from 'near-workspaces';
import {connect, keyStores, Account, utils} from 'near-api-js';

class RecordedAccount extends Account {
  async signTransaction(receiverId, actions) {
    const signed = await super.signTransaction(receiverId, actions);
    if (this.recordSigned) await this.recordSigned(utils.serialize.base_encode(Buffer.from(signed[0])), this.accountId);
    return signed;
  }
}

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const yocto = value => {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,2})(\.\d{1,6})?$/.test(value)) throw Error('Reward must be a decimal amount with at most six fractional digits.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, '0'));
  if (amount < 10n ** 21n || amount > 10n ** 24n) throw Error('Reward must be between 0.001 and 1 NEAR.');
  return amount;
};
const validAccount = value => typeof value === 'string' && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(value);

export async function createChain({wasm, configFile, repo}) {
  const bytes = await fs.readFile(wasm);
  const codeHash = hash(bytes);
  let worker, roles, contract, near;
  const network = configFile ? 'testnet' : 'local-sandbox';
  try {
    if (configFile) {
      const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
      if (!['contract', 'creator', 'verifier', 'claimant'].every(k => validAccount(config[k]))) throw Error('All configured accounts must be named NEAR testnet accounts.');
      if (new Set([config.creator, config.verifier, config.claimant]).size !== 3) throw Error('Use separate creator, verifier and claimant accounts.');
      if (typeof config.keysDirectory !== 'string' || !config.keysDirectory.startsWith('/')) throw Error('keysDirectory must be an absolute directory outside the repository.');
      const keyDir = await fs.realpath(config.keysDirectory);
      if (keyDir === repo || keyDir.startsWith(repo + path.sep)) throw Error('Signing keys must be outside the repository.');
      const store = new keyStores.UnencryptedFileSystemKeyStore(keyDir);
      for (const name of ['creator', 'verifier', 'claimant']) {
        if (!(await store.getKey('testnet', config[name]))) throw Error('A dedicated testnet account key is missing.');
      }
      near = await connect({networkId: 'testnet', nodeUrl: 'https://test.rpc.fastnear.com', keyStore: store});
      roles = Object.fromEntries(await Promise.all(['creator', 'verifier', 'claimant'].map(async r => [r, new RecordedAccount(near.connection, config[r])])));
      contract = {accountId: config.contract};
    } else {
      worker = await Worker.init();
      const root = worker.rootAccount;
      roles = {};
      for (const name of ['creator', 'verifier', 'claimant']) roles[name] = await root.createSubAccount(name);
      contract = await root.devDeploy(wasm);
    }
    const provider = worker ? worker.provider : near.connection.provider;
    if (!worker && (await provider.status()).chain_id !== 'testnet') throw Error('The configured RPC did not identify NEAR testnet.');
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function waitFinal(result) {
      const hashes = [...new Set([result.transaction_outcome, ...result.receipts_outcome].map(o => o.block_hash))];
      const blocks = await Promise.all(hashes.map(blockId => provider.block({blockId})));
      const height = Math.max(...blocks.map(b => b.header.height));
      for (let i=0; i<100; i++) {
        if ((await provider.block({finality:'final'})).header.height >= height) return;
        await pause(250);
      }
      throw Error('Transaction executed but finality is still pending. Refresh before repeating an action.');
    }
    async function checkCode() {
      const result = await provider.query({request_type: 'view_code', account_id: contract.accountId, finality: 'final'});
      if (hash(Buffer.from(result.code_base64, 'base64')) !== codeHash) throw Error('Deployed contract code does not match the local build.');
    }
    let ready = false;
    for (let i=0; i<30; i++) {
      try { await checkCode(); ready = true; break; } catch (error) { if (i === 29) throw error; await pause(300); }
    }
    if (!ready) throw Error('Contract finality was not observed.');
    return {
      network, codeHash, contract: contract.accountId,
      roles: Object.fromEntries(Object.entries(roles).map(([r, a]) => [r, a.accountId])),
      async send(role, method, args, deposit = 0n, recordSigned) {
        await checkCode();
        const account = roles[role];
        let result, value;
        if (worker) {
          const tx = await account.callRaw(contract, method, args, {gas: 100000000000000n, attachedDeposit: deposit});
          if (!tx.succeeded) throw Error('Contract transaction failed: ' + tx.receiptFailureMessages.join('; '));
          result = tx.result; value = tx.parseResult();
        } else {
          account.recordSigned = recordSigned;
          try {
            result = await account.functionCall({contractId: contract.accountId, methodName: method, args, gas: '100000000000000', attachedDeposit: deposit.toString()});
          } catch (error) {
            const txHash = error.context?.transactionHash;
            if (!txHash) throw error;
            try { result = await provider.txStatus(txHash, account.accountId, 'FINAL'); }
            catch { throw Object.assign(Error('Transaction '+txHash+' may have been broadcast. Refresh chain state and recover its receipt before repeating this action.'), {transactionHash:txHash, signerId:account.accountId}); }
          } finally { delete account.recordSigned; }
          if (typeof result.status === 'object' && result.status.Failure) throw Error('Contract transaction failed. Inspect the saved transaction.');
          value = JSON.parse(Buffer.from(result.status.SuccessValue || '', 'base64').toString() || 'null');
        }
        try { await waitFinal(result); } catch {
          throw Object.assign(Error('Transaction '+result.transaction.hash+' executed; finality could not be read. Refresh before repeating any action.'), {transaction:result});
        }
        return {value, transaction: result};
      },
      async lookup(txHash, signerId) { return provider.txStatus(txHash, signerId, 'FINAL'); },
      async view(id) {
        const result = await provider.query({request_type: 'call_function', account_id: contract.accountId, method_name: 'get_challenge', args_base64: Buffer.from(JSON.stringify({challenge_id:id})).toString('base64'), finality: 'final'});
        return {state: JSON.parse(Buffer.from(result.result).toString()), block: {block_hash:result.block_hash, block_height:result.block_height}};
      },
      async balance() {
        const result = await provider.query({request_type:'view_account', account_id: roles.claimant.accountId, finality:'final'});
        return result.amount;
      },
      async time() {
        const block = await provider.block({finality:'final'});
        return BigInt(block.header.timestamp_nanosec);
      },
      async close() { if (worker) await worker.tearDown(); },
    };
  } catch (error) {
    if (worker) await worker.tearDown();
    throw error;
  }
}
