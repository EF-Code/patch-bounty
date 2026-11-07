'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const near = amount => { const n = BigInt(amount || '0'); const fraction = (n % 10n**24n).toString().padStart(24,'0').slice(0,6).replace(/0+$/,''); return `${n / 10n**24n}${fraction ? '.'+fraction : ''}`; };
let session, selected, busy = false;
function notice(message, type='success') { const node = $('#notice'); node.className=type; node.textContent=message; }
function lock(value) { busy=value; document.querySelectorAll('button').forEach(b => { b.disabled=value || (b.id === 'ai' && !session?.aiAvailable); }); }
async function api(url, data) {
  const response = await fetch(url, data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','X-PatchBounty-Token':session.token,'X-Request-ID':crypto.randomUUID()},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Request failed.');
  return result;
}
async function load() {
  session=await api('/api/session');
  if (!session.challenges.some(c => c.id === selected)) selected=session.challenges.at(-1)?.id;
  render();
}
async function action(label, callback) {
  if (busy) return;
  lock(true); notice(label, 'working');
  try { await callback(); await load(); notice('Chain state and run evidence updated.'); }
  catch (error) { try { await load(); } catch {} notice(error.message, 'error'); }
  finally { lock(false); }
}
function render() {
  $('#network').textContent=session.network === 'testnet' ? 'NEAR testnet' : 'Local NEAR sandbox';
  $('#mode').textContent=session.network === 'testnet' ? 'Testnet mode · actions spend dedicated testnet NEAR. The operator controls the configured creator, claimant and verifier accounts.' : 'Local mode · real NEAR node and escrow contract, using simulated local-chain funds. Each launch starts a fresh local chain; previous evidence remains available under Past runs.';
  $('#count').textContent=session.challenges.length;
  $('#configuration').innerHTML=`<p>Contract: ${esc(session.contract)}</p><p>Creator: ${esc(session.roles.creator)}</p><p>Claimant: ${esc(session.roles.claimant)}</p><p>Verifier: ${esc(session.roles.verifier)}</p><p>Claimant balance: ${esc(near(session.claimantBalance))} NEAR</p><p>Contract SHA-256:<br>${esc(session.codeHash)}</p><p>Specification SHA-256:<br>${esc(session.specification.sha256)}</p>`;
  $('#challenges').innerHTML=session.challenges.length ? session.challenges.map(c => `<button class="challenge" data-select="${esc(c.id)}" aria-current="${c.id===selected}"><strong>${esc(c.title)}</strong><small><span>#${esc(c.id)} · ${esc(c.snapshot.state.status)}</span><span>${esc(near(c.snapshot.state.reward))} NEAR</span></small></button>`).join('') : '<p class="muted">No challenges yet. Create one to fund your first reward.</p>';
  document.querySelectorAll('[data-select]').forEach(b => b.onclick=()=> {selected=b.dataset.select;render();});
  const item=session.challenges.find(c=>c.id===selected);
  if (!item) return;
  const state=item.snapshot.state;
  const current=state.claim && item.attempts.find(a=>a.claimId===state.claim.id);
  const deadline=new Date(Number(BigInt(state.deadline_ns)/1000000n));
  const expired=Date.now()>=deadline.getTime();
  let content=`<div class="detail-head"><div><p class="step">Challenge #${esc(item.id)}</p><h2>${esc(item.title)}</h2></div><span class="badge ${esc(state.status)}">${esc(state.status)}</span></div><div class="meta"><div>Escrow reward<strong>${esc(near(state.reward))} NEAR</strong></div><div>Deadline<strong class="deadline-value">${esc(deadline.toLocaleString())}</strong></div></div>`;
  content+='<details class="muted"><summary>What qualifies?</summary><p>Alice must access a different account. Both the vulnerable and incomplete revisions must allow the input, and the corrected revision must deny it. Only three pinned Python fixtures are executed inside Bubblewrap. Submitted code is never accepted.</p></details>';
  if (state.status==='open' && !expired) {
    content+=`<section class="card"><p class="step">01 / Challenger</p><h3>Propose a candidate</h3><p class="muted">Choose a synthetic sample or enter a bounded JSON object. AI generation proposes data only and may consume configured NEAR AI credits.</p><div class="samples"><button class="quiet" data-sample="benign">Benign sample</button><button class="quiet" data-sample="qualifying">Qualifying sample</button><button class="quiet" data-sample="rejected">Unrelated sample</button><button class="quiet" id="ai" ${session.aiAvailable?'':'disabled'}>Generate with NEAR AI</button></div>${session.aiAvailable?'':'<p class="muted">NEAR AI generation is unavailable until NEAR_AI_API_KEY is configured in the server environment. Samples and manual input work without it.</p>'}<form id="candidate-form"><label for="candidate">Candidate JSON</label><textarea id="candidate" rows="4" maxlength="4096" required>{"user":"alice","path":"/accounts/alice/profile"}</textarea><p class="muted">AI privacy attestation and response signatures are unverified. Use synthetic data only.</p><button class="secondary" type="submit">Submit claim</button></form></section>`;
  }
  if (state.status==='claimed' && current) {
    content+=`<section class="card"><p class="step">02 / Independent verifier</p><h3>Claim #${esc(current.claimId)}</h3><pre class="code">${esc(JSON.stringify(current.candidate,null,2))}</pre><p class="muted">Candidate SHA-256: ${esc(current.candidate_sha256)}</p>`;
    if (current.error) content+=`<div class="error">${esc(current.error.message)}${current.error.execution?`<pre class="code">${esc(JSON.stringify(current.error.execution,null,2))}</pre>`:''}</div>`;
    if (current.evidence) {
      const v=current.evidence.verification;
      content+=`<p class="decision">${v.decision==='eligible'?'Eligible counterexample':'Not eligible'}</p>${['vulnerable','incomplete','corrected'].map(name=>`<div class="revision"><span>${esc(name)}</span><span class="outcome">${v.revisions[name].allowed?'allowed':'denied'}</span></div>`).join('')}<p class="muted">Evidence SHA-256: ${esc(current.evidence_sha256)}</p><a href="/api/challenges/${item.id}/evidence/${current.claimId}" download>Download exact evidence</a><div class="actions"><button class="primary" id="settle">${v.decision==='eligible'?'Approve reward payout':'Reject claim'}</button><button class="quiet" id="verify">Verify again</button></div><p class="muted">The operator signs as the authorized verifier. Settlement rechecks the candidate, evidence and on-chain claim before signing.</p>`;
    } else content+='<div class="actions"><button class="primary" id="verify">Run sandboxed verifier</button></div><p class="muted">No settlement is available until the verifier produces an eligible or ineligible result.</p>';
    content+='</section>';
  }
  if (state.status==='paid') content+='<section class="card"><p class="step">03 / Settled</p><h3>Reward paid to the recorded claimant</h3><p class="muted">The contract reports paid after its transfer callback. The same approval cannot pay twice. Inspect the transaction receipts and the balance change below.</p></section>';
  if (state.status==='refunded') content+='<section class="card"><h3>Reward refunded to the creator</h3><p class="muted">The contract completed its refund callback. The storage allowance remains with the contract.</p></section>';
  if (state.status==='approved') content+='<section class="card"><h3>Payout transfer failed</h3><p class="muted">The claim remains approved. Retry transfers only to the same recorded claimant.</p><button id="retry" class="secondary">Retry payout</button></section>';
  if (['paying','refunding'].includes(state.status)) content+='<p class="muted">A transfer callback is pending. Refresh the chain state before taking further action.</p>';
  if (['open','claimed'].includes(state.status) && expired) content+='<section class="card"><h3>This challenge has expired</h3><p class="muted">Unapproved rewards can now be returned to the creator.</p><button id="refund" class="secondary danger">Refund expired reward</button></section>';
  content+='<section class="card"><h3>Claim history and evidence</h3>';
  content+=item.attempts.length ? item.attempts.map(a => `<div class="history"><strong>Claim #${esc(a.claimId)} · ${esc(a.evidence?.verification.decision || 'awaiting verification')}</strong><pre class="code">${esc(JSON.stringify(a.candidate))}</pre>${a.evidence?`<a href="/api/challenges/${item.id}/evidence/${a.claimId}" download>Download evidence</a>`:''}${a.settlement?`<p>Recorded action: ${esc(a.settlement.method)}</p><p>Claimant balance: ${esc(near(a.settlement.balanceBefore))} → ${esc(near(a.settlement.balanceAfter))} NEAR</p><p>Transaction: ${esc(a.settlement.transaction.transaction.hash)}</p><details><summary>Inspect transaction receipts</summary><pre class="code">${esc(JSON.stringify(a.settlement.transaction,null,2))}</pre></details>`:''}</div>`).join('') : '<p class="muted">No claims have been submitted.</p>';
  content+='</section><details class="muted"><summary>Inspect latest on-chain snapshot</summary><pre class="code">'+esc(JSON.stringify(item.snapshot,null,2))+'</pre></details>';
  $('#detail').innerHTML=content;
  document.querySelectorAll('[data-sample]').forEach(b => b.onclick=()=> {const paths={benign:'alice',qualifying:'alice-backup',rejected:'bob'};$('#candidate').value=JSON.stringify({user:'alice',path:`/accounts/${paths[b.dataset.sample]}/profile`},null,2);});
  if ($('#candidate-form')) $('#candidate-form').onsubmit=event=> {event.preventDefault();const raw=$('#candidate').value;action('Submitting the candidate claim…',()=>api(`/api/challenges/${item.id}/claim`,{candidateRaw:raw}));};
  if ($('#ai')) $('#ai').onclick=()=> {
    if (!session.aiAvailable) return;
    if (busy) return;
    lock(true);notice('Requesting a synthetic NEAR AI candidate. This may take up to a minute…','working');
    api('/api/generate',{}).then(candidate=>{$('#candidate').value=JSON.stringify(candidate,null,2);notice('Candidate generated. Review it before submitting; no claim or payment was made.');}).catch(error=>notice(error.message,'error')).finally(()=>{lock(false);if ($('#ai')) $('#ai').disabled=!session.aiAvailable;});
  };
  for (const [id,label] of [['verify','Running three pinned revisions inside the sandbox…'],['settle','Signing the verifier decision and waiting for transfer receipts…'],['refund','Refunding the expired reward…'],['retry','Retrying the approved payout…']]) {
    if ($('#'+id)) $('#'+id).onclick=()=>action(label,()=>api(`/api/challenges/${item.id}/${id}`,{}));
  }
  if (busy) lock(true);
}
$('#new-challenge').onclick=()=>$('#create-dialog').showModal();
for (const b of document.querySelectorAll('.close')) b.onclick=()=>b.closest('dialog').close();
$('#create-form').onsubmit=event=>{
  event.preventDefault();const data=Object.fromEntries(new FormData(event.target));data.minutes=Number(data.minutes);
  $('#create-dialog').close();action('Funding the challenge escrow…',async()=>{const c=await api('/api/challenges',data);selected=c.id;});
};
$('#refresh').onclick=()=>action('Refreshing finalized chain state…',async()=>{});
$('#archives').onclick=async()=>{
  try {const files=await api('/api/archives');$('#archive-list').innerHTML=files.map(f=>`<div class="link-row"><a href="/api/archives/${encodeURIComponent(f)}" download>${esc(f)}</a></div>`).join('') || '<p class="muted">No saved runs yet.</p>';$('#archive-dialog').showModal();}catch(error){notice(error.message,'error');}
};
load().catch(error=>notice('Unable to connect: '+error.message,'error'));
