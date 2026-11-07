import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {hash, yocto} from './app-chain.mjs';

export function helper(repo, python, command, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['app_helper.py', command], {cwd:repo, stdio:['pipe','pipe','pipe']});
    let output = '', length = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, command === 'generate' ? 70000 : 20000);
    child.stdout.on('data', data => { length += data.length; if (length > 1024 * 1024) child.kill('SIGKILL'); else output += data; });
    // Provider/runner errors are returned as bounded structured JSON; never log inherited env.
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(Error('Unable to start the configured Python interpreter.')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return reject(Error('The generator or verifier timed out. No settlement was authorized.'));
      try {
        const data = JSON.parse(output);
        if (code !== 0) return reject(Object.assign(Error(data.error || 'Verification failed.'), {execution:data.execution}));
        resolve(data);
      } catch { reject(Error('The Python helper failed without valid evidence.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export class Application {
  constructor({repo, python, chain, dataDir}) { Object.assign(this, {repo, python, chain, dataDir}); }
  async init() {
    await fs.mkdir(this.dataDir, {recursive:true, mode:0o700});
    this.spec = await helper(this.repo, this.python, 'spec');
    this.sources = {};
    for (const name of ['verifier.py','generate.py','app_helper.py','contract/integration/app-service.mjs','contract/integration/app-chain.mjs','contract/integration/app-server.mjs','app/app.js','app/index.html','app/style.css']) this.sources[name] = hash(await fs.readFile(path.join(this.repo,name)));
    this.file = path.join(this.dataDir, this.chain.network === 'testnet' ? `testnet-${this.chain.contract}.json` : `${randomUUID()}.json`);
    this.lockFile = this.file + '.lock';
    try {
      const lock = await fs.open(this.lockFile, 'wx', 0o600); await lock.writeFile(String(process.pid)); await lock.close();
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await fs.readFile(this.lockFile, 'utf8'));
      if (!Number.isInteger(pid) || pid < 1) throw Error('An invalid operator lock exists; inspect it before starting.');
      try { process.kill(pid, 0); throw Error('Another operator application is using this testnet journal.'); }
      catch (check) { if (check.code !== 'ESRCH') throw check; }
      await fs.unlink(this.lockFile);
      const lock = await fs.open(this.lockFile, 'wx', 0o600); await lock.writeFile(String(process.pid)); await lock.close();
    }
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (this.data.contract !== this.chain.contract || this.data.codeHash !== this.chain.codeHash || JSON.stringify(this.data.roles) !== JSON.stringify(this.chain.roles)) throw Error('Saved run does not match the configured contract and roles.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.data = {format:'patchbounty-run-v1', id:randomUUID(), network:this.chain.network, contract:this.chain.contract, roles:this.chain.roles, codeHash:this.chain.codeHash, createdAt:new Date().toISOString(), application_sources:this.sources, challenges:[], events:[]};
    }
    this.event('application_started', {application_sources:this.sources});
    await this.save();
    return this;
  }
  async close() { await fs.unlink(this.lockFile).catch(() => {}); }
  async save() {
    const temp = this.file + '.tmp';
    await fs.writeFile(temp, JSON.stringify(this.data, null, 2) + '\n', {mode:0o600});
    await fs.rename(temp, this.file);
  }
  event(action, extra = {}) { this.data.events.push({time:new Date().toISOString(), ...extra, action}); }
  challenge(id) {
    const item = this.data.challenges.find(c => c.id === id);
    if (!item) throw Error('Unknown challenge in this run.');
    return item;
  }
  async refresh(item) {
    const snapshot = await this.chain.view(item.id);
    if (!snapshot.state) throw Error('Challenge was not found on the chain.');
    item.snapshot = snapshot;
    return item;
  }
  async session() {
    for (const item of this.data.challenges) await this.refresh(item);
    await this.save();
    return {network:this.chain.network, contract:this.chain.contract, roles:this.chain.roles, runId:this.data.id, codeHash:this.chain.codeHash, specification:this.spec, aiAvailable:Boolean(process.env.NEAR_AI_API_KEY), claimantBalance:await this.chain.balance(), ...{challenges:this.data.challenges}};
  }
  async transaction(action, role, method, args, deposit = 0n) {
    this.event('transaction_requested', {operation:action, role, method, args, deposit:deposit.toString()});
    await this.save();
    try {
      const result = await this.chain.send(role, method, args, deposit, async (transactionHash, signerId) => {
        this.event('transaction_signed', {operation:action, role, method, args, transactionHash, signerId}); await this.save();
      });
      this.event('transaction_completed', {operation:action, transaction:result.transaction});
      await this.save();
      return result;
    } catch (error) {
      this.event('transaction_error', {operation:action, role, method, args, error:error.message, transaction:error.transaction, transactionHash:error.transactionHash, signerId:error.signerId});
      await this.save();
      throw error;
    }
  }
  async generate() {
    try {
      const result = await helper(this.repo, this.python, 'generate');
      this.event('ai_candidate_generated', result);
      await this.save();
      return result.candidate;
    } catch (error) {
      this.event('ai_generation_error', {error:error.message}); await this.save(); throw error;
    }
  }
  async create(body) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100) throw Error('Give the challenge a title of 1–100 characters.');
    if (!Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 1440) throw Error('Duration must be 1–1440 minutes.');
    const reward = yocto(body.reward);
    const deadline = (await this.chain.time() + BigInt(body.minutes) * 60n * 1000000000n).toString();
    const result = await this.transaction('create', 'creator', 'create_challenge', {verifier:this.chain.roles.verifier, specification_sha256:this.spec.sha256, deadline_ns:deadline}, reward + 2n * 10n ** 22n);
    const item = {id:String(result.value), title:body.title.trim(), attempts:[], createdAt:new Date().toISOString()};
    this.data.challenges.push(item);
    await this.refresh(item); await this.save();
    return item;
  }
  async claim(id, body) {
    const item = await this.refresh(this.challenge(id));
    if (item.snapshot.state.status !== 'open') throw Error('This challenge is not open. Refresh its state.');
    const raw = body.candidateRaw ?? JSON.stringify(body.candidate);
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4096) throw Error('A bounded candidate JSON object is required.');
    const parsed = await helper(this.repo, this.python, 'candidate', raw);
    const claim = await this.transaction('claim', 'claimant', 'submit_claim', {challenge_id:id, candidate_sha256:parsed.candidate_sha256});
    item.attempts.push({claimId:String(claim.value), candidate:parsed.candidate, candidateRaw:raw, candidate_sha256:parsed.candidate_sha256, submittedAt:new Date().toISOString()});
    await this.refresh(item); await this.save(); return item;
  }
  current(item) {
    const claim = item.snapshot.state.claim;
    const attempt = claim && item.attempts.find(a => a.claimId === claim.id && a.candidate_sha256 === claim.candidate_sha256);
    if (!attempt) throw Error('The current on-chain claim has no matching local candidate.');
    return attempt;
  }
  async verify(id) {
    const item = await this.refresh(this.challenge(id));
    if (item.snapshot.state.status !== 'claimed') throw Error('There is no claim awaiting verification.');
    if (item.snapshot.state.specification_sha256 !== this.spec.sha256) throw Error('The challenge specification differs from this verifier.');
    const attempt = this.current(item);
    try {
      const verification = await helper(this.repo, this.python, 'verify', attempt.candidateRaw);
      if (verification.verifier_sha256 !== this.spec.specification.verifier_sha256) throw Error('Verifier source changed since this run started.');
      if (verification.candidate_sha256 !== attempt.candidate_sha256) throw Error('Candidate digest changed.');
      const evidence = {format:'patchbounty-evidence-v1', network:this.chain.network, contract:this.chain.contract, challenge_id:id, chain_challenge:item.snapshot.state, chain_block:item.snapshot.block, specification:this.spec.specification, application_sources:this.sources, verification};
      const bytes = JSON.stringify(evidence, null, 2) + '\n';
      attempt.evidence = evidence; attempt.evidenceBytes = bytes; attempt.evidence_sha256 = hash(bytes); delete attempt.error;
      this.event('verified', {challenge:id, claimId:attempt.claimId, decision:verification.decision, evidence_sha256:attempt.evidence_sha256});
      await this.save(); return item;
    } catch (error) {
      attempt.error = {message:error.message, execution:error.execution};
      delete attempt.evidence; delete attempt.evidenceBytes; delete attempt.evidence_sha256;
      this.event('verification_error', {challenge:id, claimId:attempt.claimId, error:attempt.error});
      await this.save(); throw error;
    }
  }
  async settle(id) {
    const item = await this.refresh(this.challenge(id));
    if (item.snapshot.state.status !== 'claimed') throw Error('There is no claim awaiting settlement.');
    const attempt = this.current(item);
    if (!attempt.evidenceBytes || hash(attempt.evidenceBytes) !== attempt.evidence_sha256) throw Error('Run the deterministic verifier before settlement.');
    // Recheck specification, claimant and decision bindings immediately before signing.
    const state = item.snapshot.state;
    if (state.specification_sha256 !== this.spec.sha256 || state.verifier !== this.chain.roles.verifier || state.claim.claimant !== this.chain.roles.claimant) throw Error('On-chain role or specification mismatch.');
    const evidence = JSON.parse(attempt.evidenceBytes);
    const fresh = await helper(this.repo, this.python, 'verify', attempt.candidateRaw);
    if (JSON.stringify(evidence.verification) !== JSON.stringify(fresh) || evidence.contract !== this.chain.contract || evidence.challenge_id !== id || evidence.chain_challenge.claim.id !== attempt.claimId) throw Error('Saved evidence no longer matches an independent verification. Verify the claim again.');
    const decision = fresh.decision;
    if (!['eligible', 'not_eligible'].includes(decision)) throw Error('No valid verifier decision.');
    const method = decision === 'eligible' ? 'approve_claim' : 'reject_claim';
    const args = {challenge_id:id, claim_id:attempt.claimId};
    if (method === 'approve_claim') Object.assign(args, {candidate_sha256:attempt.candidate_sha256, evidence_sha256:attempt.evidence_sha256});
    attempt.balanceBefore = await this.chain.balance();
    const tx = await this.transaction('settle', 'verifier', method, args);
    attempt.settlement = {method, transaction:tx.transaction, balanceBefore:attempt.balanceBefore, balanceAfter:await this.chain.balance()};
    await this.refresh(item); await this.save(); return item;
  }
  async receipts(id) {
    const item = await this.refresh(this.challenge(id));
    for (const attempt of item.attempts.filter(a => a.evidence && !a.settlement && a.balanceBefore)) {
      const event = [...this.data.events].reverse().find(e => e.action === 'transaction_signed' && e.args?.challenge_id === id && e.args?.claim_id === attempt.claimId && ['approve_claim','reject_claim'].includes(e.method));
      if (!event) continue;
      const tx = await this.chain.lookup(event.transactionHash, event.signerId);
      const call = tx.transaction.actions[0]?.FunctionCall;
      if (tx.transaction.signer_id !== this.chain.roles.verifier || tx.transaction.receiver_id !== this.chain.contract || call?.method_name !== event.method || tx.status?.Failure) throw Error('Recovered receipt does not match the requested verifier action.');
      const args = JSON.parse(Buffer.from(call.args,'base64').toString());
      if (args.challenge_id !== id || args.claim_id !== attempt.claimId) throw Error('Recovered claim identifiers do not match.');
      if (event.method === 'approve_claim' && (args.evidence_sha256 !== attempt.evidence_sha256 || args.candidate_sha256 !== attempt.candidate_sha256)) throw Error('Recovered evidence identifiers do not match.');
      attempt.settlement = {method:event.method, transaction:tx, balanceBefore:attempt.balanceBefore, balanceAfter:await this.chain.balance(), recovered:true};
      this.event('receipts_recovered', {challenge:id, claimId:attempt.claimId, transaction:tx});
    }
    await this.save(); return item;
  }
  async recover(id, action) {
    const item = await this.refresh(this.challenge(id));
    const method = action === 'refund' ? 'refund' : 'retry_payout';
    const state = item.snapshot.state;
    if (method === 'refund' && !['open','claimed'].includes(state.status)) throw Error('This challenge cannot be refunded.');
    if (method === 'retry_payout' && state.status !== 'approved') throw Error('There is no failed payout to retry.');
    await this.transaction(action, method === 'refund' ? 'creator' : 'verifier', method, {challenge_id:id});
    await this.refresh(item); await this.save(); return item;
  }
}
