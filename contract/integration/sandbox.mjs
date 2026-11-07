import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Worker} from 'near-workspaces';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const python = process.env.PATCHBOUNTY_PYTHON || 'python3';
const runPython = (...args) => JSON.parse(execFileSync(python, args, {cwd: repo, encoding: 'utf8'}));
const specification = runPython('settlement.py', 'spec');
const good = runPython('verifier.py', 'candidates/qualifying.json');
const bad = runPython('verifier.py', 'candidates/benign.json');
assert.equal(good.decision, 'eligible');
assert.equal(bad.decision, 'not_eligible');

const worker = await Worker.init();
try {
  const root = worker.rootAccount;
  const verifier = await root.createSubAccount('verifier');
  const alice = await root.createSubAccount('alice');
  const bob = await root.createSubAccount('bob');
  const contract = await root.devDeploy(path.join(repo, 'contract/target/wasm32-unknown-unknown/release/patchbounty_escrow_near.wasm'));
  const deadline = (BigInt(Date.now() + 600000) * 1000000n).toString();
  const deposit = 100000000000000000000000n;
  const reward = deposit - 20000000000000000000000n;
  const callOptions = {gas: 100000000000000n};
  const id = await root.call(contract, 'create_challenge', {
    verifier: verifier.accountId, specification_sha256: specification.sha256, deadline_ns: deadline,
  }, {...callOptions, attachedDeposit: deposit});
  assert.equal(id, '0');
  let claim = await alice.call(contract, 'submit_claim', {challenge_id: id, candidate_sha256: bad.candidate_sha256}, callOptions);
  assert.equal(claim, '0');
  await verifier.call(contract, 'reject_claim', {challenge_id: id, claim_id: claim}, callOptions);
  claim = await alice.call(contract, 'submit_claim', {challenge_id: id, candidate_sha256: good.candidate_sha256}, callOptions);
  assert.equal(claim, '1');
  const state = await contract.view('get_challenge', {challenge_id: id});
  assert.equal(state.claim.claimant, alice.accountId);
  const evidence = JSON.stringify({network: 'local-sandbox', contract: contract.accountId, challenge: id,
                                   claim: state.claim, verification: good});
  const evidenceSha = createHash('sha256').update(evidence).digest('hex');
  const args = {challenge_id: id, claim_id: claim, candidate_sha256: good.candidate_sha256, evidence_sha256: evidenceSha};
  await assert.rejects(() => bob.call(contract, 'approve_claim', args, callOptions));
  const before = await alice.availableBalance();
  await verifier.call(contract, 'approve_claim', args, callOptions);
  const after = await alice.availableBalance();
  assert.equal(after - before, reward);
  assert.equal((await contract.view('get_challenge', {challenge_id: id})).status, 'paid');
  await assert.rejects(() => verifier.call(contract, 'approve_claim', args, callOptions));
  console.log('PASS: local sandbox rejected an ineligible claim, paid the recorded claimant, and rejected replay');
} finally {
  await worker.tearDown();
}
