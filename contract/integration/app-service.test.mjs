import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Application} from './app-service.mjs';
import {yocto} from './app-chain.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const python=process.env.PATCHBOUNTY_PYTHON || path.join(os.homedir(),'.venv/bin/python');
function fakeChain() {
  let state, next=0;
  return {network:'local-sandbox',contract:'contract.test.near',codeHash:'a'.repeat(64),roles:{creator:'creator.test.near',claimant:'claimant.test.near',verifier:'verifier.test.near'},sent:[],
    time:async()=>BigInt(Date.now())*1000000n,
    balance:async()=> '1000000000000000000000000',
    view:async()=>({state:structuredClone(state),block:{block_hash:'unit-test-only',block_height:1}}),
    async send(role,method,args,deposit) {
      this.sent.push({role,method,args,deposit});
      let value;
      if(method==='create_challenge'){value='0';state={status:'open',verifier:this.roles.verifier,specification_sha256:args.specification_sha256,deadline_ns:args.deadline_ns,reward:(deposit-2n*10n**22n).toString(),claim:null};}
      if(method==='submit_claim'){value=String(next++);state.status='claimed';state.claim={id:value,candidate_sha256:args.candidate_sha256,claimant:this.roles.claimant};}
      if(method==='reject_claim'){state.status='open';state.claim=null;}
      if(method==='approve_claim')state.status='paid';
      return {value,transaction:{transaction:{hash:'unit-test-only'}}};
    }};
}
async function fixture(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pb-service-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const chain=fakeChain();
  const app=await new Application({repo,python,chain,dataDir:dir}).init();
  await app.create({title:'Authorization',reward:'0.08',minutes:60});
  return {app,chain};
}
test('reward parser rejects scientific, signed, excessive and imprecise amounts',()=>{
  assert.equal(yocto('0.08'),80000000000000000000000n);
  for(const v of ['1e2','-1','0','1.000001','0.000999','0.1000001',0.08,null])assert.throws(()=>yocto(v));
});
test('invalid candidate never reaches the chain',async t=>{
  const {app,chain}=await fixture(t);
  await assert.rejects(()=>app.claim('0',{candidateRaw:'{"user":"alice","user":"bob","path":"/accounts/alice/profile"}'}),/unique keys/);
  assert.equal(chain.sent.length,1);
});
test('no settlement is possible without successful sandbox verification',async t=>{
  const {app,chain}=await fixture(t);
  await app.claim('0',{candidate:{user:'alice',path:'/accounts/alice-backup/profile'}});
  await assert.rejects(()=>app.settle('0'),/Run the deterministic verifier/);
  assert.equal(chain.sent.length,2);
});
test('tampering a saved object cannot change the signed verifier decision',async t=>{
  const {app,chain}=await fixture(t);
  await app.claim('0',{candidate:{user:'alice',path:'/accounts/alice/profile'}});
  const item=await app.verify('0');
  item.attempts[0].evidence.verification.decision='eligible';
  await app.settle('0');
  assert.equal(chain.sent.at(-1).method,'reject_claim');
});
test('altered evidence bytes fail closed and the evidence journal survives reload',async t=>{
  const {app,chain}=await fixture(t);
  await app.claim('0',{candidate:{user:'alice',path:'/accounts/alice-backup/profile'}});
  const item=await app.verify('0');
  const original=item.attempts[0].evidenceBytes;
  item.attempts[0].evidenceBytes=original.replace('eligible','not_eligible');
  await assert.rejects(()=>app.settle('0'),/Run the deterministic verifier/);
  const saved=JSON.parse(await fs.readFile(app.file));
  assert.equal(saved.challenges[0].attempts[0].evidence.verification.decision,'eligible');
  assert.equal(chain.sent.length,2);
});
test('receipt recovery never broadcasts a second approval after a network error',async t=>{
  const {app,chain}=await fixture(t);
  await app.claim('0',{candidateRaw:'{ "user": "alice", "path": "/accounts/alice-backup/profile" }'});
  const verified=await app.verify('0');
  assert.equal(verified.attempts[0].candidateRaw,'{ "user": "alice", "path": "/accounts/alice-backup/profile" }');
  const original=chain.send.bind(chain);let receipt;
  chain.send=async(role,method,args,deposit,onSigned)=>{
    const result=await original(role,method,args,deposit);
    receipt={transaction:{hash:'signed-before-broadcast',signer_id:chain.roles.verifier,receiver_id:chain.contract,actions:[{FunctionCall:{method_name:method,args:Buffer.from(JSON.stringify(args)).toString('base64')}}]},status:{SuccessValue:''}};
    await onSigned('signed-before-broadcast',chain.roles.verifier);
    throw Error('Simulated RPC read failure after successful broadcast');
  };
  chain.lookup=async()=>receipt;
  await assert.rejects(()=>app.settle('0'),/Simulated RPC/);
  const count=chain.sent.length;
  const item=await app.receipts('0');
  assert.equal(item.snapshot.state.status,'paid');
  assert.equal(item.attempts[0].settlement.recovered,true);
  assert.equal(chain.sent.length,count);
});
