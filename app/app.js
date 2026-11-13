"use strict";
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const near = (amount) => {
  const n = BigInt(amount || "0");
  const f = (n % 10n ** 24n)
    .toString()
    .padStart(24, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return `${n / 10n ** 24n}${f ? "." + f : ""}`;
};
const paths = {
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  check: "m5 12 4 4L19 6",
  file: "M14 3H5v18h14V8zm0 0v5h5M8 12h8m-8 4h5",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16",
  shield: "m12 3 8 4v6c0 5-8 9-8 9s-8-4-8-9V7zM8 12l3 3 5-6",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4",
  clock: "M12 7v5l3 2",
  copy: "M9 8V3h12v14h-5M3 8h13v13H3z",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  chevron: "m9 5 7 7-7 7",
  lock: "M6 10h12v11H6zm2 0V7a4 4 0 0 1 8 0v3",
  alert: "M12 8v5m0 3v1M12 3 2 21h20z",
};
const icon = (name, extra = "") =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon ${extra}">${name === "clock" ? '<circle cx="12" cy="12" r="9"/>' : ""}<path d="${paths[name] || paths.file}"/></svg>`;
const emptyDetail = $("#detail").innerHTML;
const drafts = new Map();
const initialView = new URLSearchParams(location.hash.slice(1));
let session,
  selected = initialView.get("challenge") || undefined,
  activeTab = ["overview", "evidence", "activity"].includes(
    initialView.get("view"),
  )
    ? initialView.get("view")
    : "overview",
  busy = false,
  noticeTimer;
function saveView(push = false) {
  if (selected === undefined) return;
  const hash =
    "#" + new URLSearchParams({ challenge: selected, view: activeTab });
  if (location.hash !== hash)
    history[push ? "pushState" : "replaceState"](null, "", hash);
}
function notice(message, type = "success") {
  clearTimeout(noticeTimer);
  const node = $("#notice");
  node.className = type;
  node.textContent = message;
  if (type === "success")
    noticeTimer = setTimeout(() => {
      node.textContent = "";
      node.className = "";
    }, 6500);
}
function lock(value) {
  busy = value;
  document.querySelectorAll("button").forEach((b) => {
    b.disabled =
      value ||
      b.dataset.unavailable === "true" ||
      (b.id === "ai" && !session?.aiAvailable);
  });
}
async function api(url, data) {
  const response = await fetch(
    url,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PatchBounty-Token": session.token,
            "X-Request-ID": crypto.randomUUID(),
          },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Request failed.");
  return result;
}
async function load() {
  try {
    session = await api("/api/session");
  } catch (error) {
    $("#network").dataset.ready = "false";
    $("#network").textContent =
      session?.network === "testnet"
        ? "Testnet unavailable"
        : "Connection unavailable";
    throw error;
  }
  if (!session.challenges.some((c) => c.id === selected)) {
    selected = session.challenges.at(-1)?.id;
    activeTab = "overview";
  }
  saveView();
  render();
}
async function action(
  label,
  callback,
  success = "Workspace updated.",
  errorField,
) {
  if (busy) return;
  lock(true);
  notice(label, "working");
  try {
    await callback();
    await load();
    notice(success);
  } catch (error) {
    try {
      await load();
    } catch {}
    notice(error.message, "error");
    if (errorField && $("#" + errorField)) {
      const input = $("#" + errorField);
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "candidate-error");
      const message = document.createElement("p");
      message.id = "candidate-error";
      message.className = "field-error";
      message.setAttribute("role", "alert");
      message.textContent = error.message;
      input.closest(".editor").after(message);
      input.focus();
    }
  } finally {
    lock(false);
  }
}
const date = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const statusName = (state, current) =>
  ({
    open: "Open for claims",
    claimed: current?.evidence ? "Ready to settle" : "Awaiting verification",
    paying: "Payout pending",
    approved: "Retry needed",
    paid: "Paid",
    refunding: "Refund pending",
    refunded: "Refunded",
  })[state.status] || state.status;
function patchComparison() {
  return `<section class="patch-reference"><div class="section-heading"><h3>The patch under review</h3><span class="fixture-tag">Python</span></div><div class="patch-column"><div class="patch-label"><span class="patch-dot incomplete"></span>Incomplete check</div><pre class="patch-line removed"><code>parts[2].startswith(request["user"])</code></pre></div><div class="patch-column"><div class="patch-label"><span class="patch-dot corrected"></span>Corrected check</div><pre class="patch-line added"><code>parts[2] == request["user"]</code></pre></div><p class="context-copy">A prefix match can accept a different account. A complete match closes that edge case.</p><details class="qualification"><summary>Eligibility rules</summary><p>The target account must differ from the user. The vulnerable and incomplete revisions must allow the input; the corrected revision must deny it. Exact fixture hashes are pinned by the verifier.</p></details></section>`;
}
function workflow(state, current, expired) {
  if (["refunding", "refunded"].includes(state.status))
    return `<div class="closed-workflow">${icon("clock")}${state.status === "refunded" ? "Closed after expiry. The reward was returned to the creator." : "Refund requested. Waiting for the transfer callback."}</div>`;
  const complete = state.status === "paid";
  const stage = complete
    ? 3
    : state.status === "open"
      ? 0
      : current?.evidence
        ? 2
        : 1;
  return `<ol class="workflow" aria-label="Challenge workflow">${["Propose input", "Verify evidence", "Settle reward"].map((label, i) => `<li class="${stage > i ? "complete" : stage === i ? "active" : ""}" ${stage === i ? 'aria-current="step"' : ""}><span>${stage > i ? icon("check") : i + 1}</span><div>${label}</div></li>`).join("")}</ol>${expired && !complete ? '<p class="expiry-note">The deadline has passed. An unapproved reward can now be refunded.</p>' : ""}`;
}
function candidateEditor(item) {
  const raw =
    drafts.get(item.id) ??
    '{\n  "user": "alice",\n  "path": "/accounts/alice/profile"\n}';
  return `<div class="review-grid"><section class="proposal"><div class="section-heading"><div><h3>Propose an input</h3><p>Start with a sample, or write a candidate of your own.</p></div></div><div class="samples" aria-label="Candidate samples"><button class="sample" type="button" data-sample="benign">Benign sample</button><button class="sample" type="button" data-sample="qualifying">Qualifying sample</button><button class="sample" type="button" data-sample="rejected">Unrelated sample</button></div><form id="candidate-form"><label class="editor-label" for="candidate">Candidate JSON<span>Data only</span></label><div class="editor"><div class="editor-top">${icon("file")}<span>candidate.json</span><span class="editor-format">JSON</span></div><textarea id="candidate" rows="5" maxlength="4096" spellcheck="false" autocapitalize="off" autocomplete="off" name="candidate" required>${esc(raw)}</textarea></div><div class="editor-actions"><button class="quiet ai-button" id="ai" type="button" data-unavailable="${!session.aiAvailable}" ${session.aiAvailable ? "" : "disabled"} title="${session.aiAvailable ? "Propose synthetic input using configured NEAR AI credits" : "Configure the server’s NEAR AI credential to enable generation"}">${icon("spark")}Generate with NEAR AI</button><button class="primary" type="submit">Submit claim${icon("arrow")}</button></div></form><p class="input-note">${icon("lock")}Synthetic data only. AI proposals use a fixed prompt, may consume credits, and do not submit a claim or authorize a payment. Inference privacy is not attested.</p>${session.aiAvailable ? "" : '<p class="muted connection-note">AI is not connected. Samples and manual input are ready to use.</p>'}</section>${patchComparison()}</div>`;
}
function revisionResults(v) {
  const names = {
    vulnerable: "Vulnerable revision",
    incomplete: "Incomplete patch",
    corrected: "Corrected patch",
  };
  return `<div class="revision-table"><div class="revision-table-head"><span>Pinned revision</span><span>Access result</span></div>${Object.entries(
    names,
  )
    .map(
      ([name, label]) =>
        `<div class="revision"><span>${label}${name === "corrected" ? "<small>Reference fix</small>" : ""}</span><span class="access ${v.revisions[name].allowed ? "allowed" : "denied"}">${icon(v.revisions[name].allowed ? "chevron" : "check")}${v.revisions[name].allowed ? "Allowed" : "Denied"}</span></div>`,
    )
    .join("")}</div>`;
}
function currentClaim(item, current, expired) {
  let content = `<div class="claim-topline"><span class="fixture-tag">Claim #${esc(current.claimId)}</span><span class="muted">Submitted ${esc(date(current.submittedAt))}</span></div>`;
  if (current.error)
    content += `<div class="inline-error">${icon("alert")}<div><strong>Verification did not complete</strong><p>${esc(current.error.message)}</p>${current.error.execution ? `<details><summary>Execution details</summary><pre class="code">${esc(JSON.stringify(current.error.execution, null, 2))}</pre></details>` : ""}</div></div>`;
  const candidate = `<div class="candidate-preview"><div class="editor-top">${icon("file")}<span>candidate.json</span><span class="editor-format">Submitted input</span></div><pre class="code">${esc(JSON.stringify(current.candidate, null, 2))}</pre></div>`;
  if (!current.evidence)
    return (
      content +
      `<div class="review-grid"><section><div class="section-heading"><div><h3>Check the counterexample</h3><p>The candidate is recorded. Run it against the three exact revisions.</p></div></div>${candidate}<div class="verification-prompt">${icon("shield")}<p>The sandboxed verifier checks the property.<br>It does not release the reward.</p></div><button class="primary" id="verify">Run sandboxed verifier${icon("arrow")}</button></section>${patchComparison()}</div>`
    );
  const v = current.evidence.verification;
  const eligible = v.decision === "eligible";
  return (
    content +
    `<div class="verdict ${eligible ? "eligible" : "ineligible"}"><span class="verdict-icon">${icon(eligible ? "check" : "shield")}</span><div><h3>${eligible ? "Eligible counterexample" : "Not eligible"}</h3><p>${eligible ? "The incomplete patch allows the input. The corrected patch denies it." : "This input does not meet all three eligibility checks."}</p></div><span class="verdict-label">Verified</span></div><div class="verification-grid">${candidate}<section>${revisionResults(v)}</section></div><details class="hash-disclosure"><summary>Exact candidate and evidence identifiers</summary>${hashRow("Candidate SHA-256", current.candidate_sha256)}${hashRow("Evidence SHA-256", current.evidence_sha256)}</details><div class="decision-bar"><div><a class="text-link" href="/api/challenges/${item.id}/evidence/${current.claimId}" download>${icon("download")}Download exact evidence</a><p>The operator signs as the authorized verifier.</p></div><div class="actions"><button class="quiet" id="verify">Verify again</button><button class="${eligible ? "primary" : "secondary"}" id="settle" data-unavailable="${expired}" ${expired ? "disabled" : ""}>${eligible ? "Approve reward payout" : "Reject claim"}</button></div></div><p class="input-note">${icon("shield")}Settlement independently rechecks the candidate, evidence and on-chain claim before signing.</p>`
  );
}
function hashRow(label, value) {
  return `<div class="hash-row"><span>${label}</span><code>${esc(value)}</code><button class="copy-button" data-copy="${esc(value)}" type="button" aria-label="Copy ${label}" title="Copy ${label}">${icon("copy")}</button></div>`;
}
function settlementView(item, current) {
  const state = item.snapshot.state;
  if (state.status === "paid")
    return `<section class="settlement-complete"><div class="settlement-icon">${icon("check")}</div><span class="fixture-tag">Settlement complete</span><h3>Reward paid to the recorded claimant</h3><div class="settlement-amount">${esc(near(state.reward))}<span>NEAR</span></div><p>The transfer callback reports <strong>paid</strong>. This approval cannot pay twice.</p>${current?.settlement ? `<div class="balance-change"><span>Claimant balance</span><strong>${esc(near(current.settlement.balanceBefore))}<span aria-label="changed to">→</span>${esc(near(current.settlement.balanceAfter))} <small>NEAR</small></strong></div>${current.settlement.recovered ? '<p class="muted">Receipt recovered after interruption. The later balance snapshot may include other activity.</p>' : ""}<button class="secondary" data-tab-target="evidence">${icon("file")}Review evidence and receipt</button>` : `<div class="recovery"><p>The chain confirms payment, but its receipt was not saved. Recover it from the signed transaction journal.</p><button id="receipts" class="secondary">Recover receipts</button></div>`}</section>`;
  if (state.status === "refunded")
    return `<section class="settlement-complete refund-complete"><div class="settlement-icon">${icon("check")}</div><h3>Reward refunded to the creator</h3><div class="settlement-amount">${esc(near(state.reward))}<span>NEAR</span></div><p>The refund callback is complete. The storage allowance remains with the contract.</p></section>`;
  if (state.status === "approved")
    return `<section class="recovery-panel">${icon("alert")}<div><h3>Payout transfer failed</h3><p>The claim remains approved. A retry transfers only to the same recorded claimant.</p><button id="retry" class="secondary">Retry payout</button></div></section>`;
  return `<section class="pending-panel">${icon("clock")}<h3>Waiting for the transfer callback</h3><p>Refresh the finalized chain state to check the outcome.</p></section>`;
}
function evidenceView(item) {
  if (!item.attempts.length)
    return `<div class="tab-empty">${icon("file")}<h3>No evidence yet</h3><p>Submit a candidate and run the verifier to produce the exact execution evidence.</p><button class="secondary" data-tab-target="overview">Propose an input</button></div>`;
  return (
    `<div class="section-heading"><div><h3>Evidence library</h3><p>Exact inputs, pinned revisions and public transaction receipts for this challenge.</p></div><span class="fixture-tag">${item.attempts.length} ${item.attempts.length === 1 ? "claim" : "claims"}</span></div>` +
    item.attempts
      .toReversed()
      .map(
        (a) =>
          `<section class="evidence-entry"><div class="evidence-entry-heading"><div><h4>Claim #${esc(a.claimId)}</h4><span>${esc(date(a.submittedAt))}</span></div><span class="badge ${a.evidence?.verification.decision === "eligible" ? "confirmed" : ""}">${esc(a.evidence?.verification.decision === "eligible" ? "Eligible" : a.evidence ? "Not eligible" : "Not verified")}</span></div><pre class="code">${esc(JSON.stringify(a.candidate, null, 2))}</pre>${a.evidence ? `${hashRow("Evidence SHA-256", a.evidence_sha256)}<div class="evidence-links"><a class="text-link" href="/api/challenges/${item.id}/evidence/${a.claimId}" download>${icon("download")}Download evidence</a><details><summary>Pinned revision results</summary>${revisionResults(a.evidence.verification)}</details></div>` : '<p class="muted">Run the verifier to produce an execution result.</p>'}${a.settlement ? `<div class="receipt-block"><div class="section-heading"><h4>${a.settlement.method === "approve_claim" ? "Reward approved" : "Claim rejected"}</h4><span class="fixture-tag">Receipt recorded</span></div>${hashRow("Transaction", a.settlement.transaction.transaction.hash)}${session.network === "testnet" ? `<a class="text-link" href="https://explorer.testnet.near.org/transactions/${encodeURIComponent(a.settlement.transaction.transaction.hash)}" target="_blank" rel="noopener noreferrer">View on testnet explorer</a>` : ""}<details><summary>Inspect transaction receipts</summary><pre class="code receipt-json">${esc(JSON.stringify(a.settlement.transaction, null, 2))}</pre></details></div>` : ""}</section>`,
      )
      .join("")
  );
}
function activityView(item) {
  const refundActivity = ["refunding", "refunded"].includes(
    item.snapshot.state.status,
  )
    ? `<li><span class="activity-icon">${icon("clock")}</span><div><strong>${item.snapshot.state.status === "refunded" ? "Reward refunded" : "Refund requested"}</strong><p>${item.snapshot.state.status === "refunded" ? "Finalized contract state confirms the refund callback." : "Waiting for the contract’s refund callback."}</p></div></li>`
    : "";
  return `<div class="section-heading"><div><h3>Challenge activity</h3><p>Recorded actions from this operator run.</p></div></div><ol class="activity"><li><span class="activity-icon">${icon("lock")}</span><div><strong>Challenge funded</strong><p>${esc(near(item.snapshot.state.reward))} NEAR reward held in escrow.</p><time>${esc(date(item.createdAt))}</time></div></li>${item.attempts.map((a) => `<li><span class="activity-icon">${icon("code")}</span><div><strong>Claim #${esc(a.claimId)} submitted</strong><p>${esc(a.candidate.path)}</p><time>${esc(date(a.submittedAt))}</time></div></li>${a.evidence ? `<li><span class="activity-icon ${a.evidence.verification.decision === "eligible" ? "positive" : ""}">${icon("shield")}</span><div><strong>Verifier returned ${a.evidence.verification.decision === "eligible" ? "eligible" : "not eligible"}</strong><p>Three pinned revisions checked in the sandbox.</p></div></li>` : ""}${a.settlement ? `<li><span class="activity-icon positive">${icon("check")}</span><div><strong>${a.settlement.method === "approve_claim" ? "Reward approval recorded" : "Claim rejected"}</strong><p>Public transaction receipt saved with the evidence.</p></div></li>` : ""}`).join("")}${refundActivity}</ol>`;
}
function renderDetail() {
  const item = session.challenges.find((c) => c.id === selected);
  if (!item) {
    $("#detail").innerHTML = emptyDetail;
    bindCreate();
    return;
  }
  const state = item.snapshot.state;
  const current =
    state.claim && item.attempts.find((a) => a.claimId === state.claim.id);
  const deadline = new Date(Number(BigInt(state.deadline_ns) / 1000000n));
  const expired = Date.now() >= deadline.getTime();
  let panel = "";
  if (activeTab === "evidence") panel = evidenceView(item);
  else if (activeTab === "activity") panel = activityView(item);
  else {
    if (state.status === "open" && !expired) panel = candidateEditor(item);
    else if (state.status === "claimed" && current)
      panel = currentClaim(item, current, expired);
    else if (
      ["paid", "refunded", "approved", "paying", "refunding"].includes(
        state.status,
      )
    )
      panel = settlementView(item, current);
    else if (state.status === "claimed")
      panel =
        '<div class="inline-error">The on-chain claim has no matching local candidate in this run. Inspect the run export before proceeding.</div>';
    if (["open", "claimed"].includes(state.status) && expired)
      panel += `<section class="recovery-panel">${icon("clock")}<div><h3>This challenge has expired</h3><p>Return the unapproved reward to the creator. The storage allowance stays with the contract.</p><button id="refund" class="secondary">Refund expired reward</button></div></section>`;
  }
  $("#detail").innerHTML =
    `<div class="detail-heading"><div><div class="detail-kicker"><span>Challenge #${esc(item.id)}</span><span class="kicker-dot"></span><span>Authorization</span></div><h2>${esc(item.title)}</h2></div><span class="badge ${esc(state.status)}">${esc(statusName(state, current))}</span></div><div class="challenge-meta"><div><span>Escrow reward</span><strong>${esc(near(state.reward))} <small>NEAR</small></strong></div><div><span>Deadline <small>(${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)})</small></span><strong class="deadline-value">${esc(date(deadline))}</strong></div><div><span>Submitted claims</span><strong>${item.attempts.length}</strong></div></div>${workflow(state, current, expired)}<div class="detail-tabs" role="tablist" aria-label="Challenge views">${["overview", "evidence", "activity"].map((name) => `<button id="tab-${name}" role="tab" aria-selected="${activeTab === name}" aria-controls="tab-panel" tabindex="${activeTab === name ? 0 : -1}" data-tab="${name}">${name[0].toUpperCase() + name.slice(1)}${name === "evidence" && item.attempts.some((a) => a.evidence) ? '<span class="tab-count">' + item.attempts.filter((a) => a.evidence).length + "</span>" : ""}</button>`).join("")}</div><section id="tab-panel" class="tab-panel" role="tabpanel" aria-labelledby="tab-${activeTab}" tabindex="0">${panel}</section><details class="chain-snapshot"><summary>${icon("shield")}Finalized chain snapshot<span>Block ${esc(item.snapshot.block.block_height)}</span></summary><pre class="code">${esc(JSON.stringify(item.snapshot, null, 2))}</pre></details>`;
  bindDetail(item);
}
function render() {
  $("#network").dataset.ready = "true";
  $("#network").textContent =
    session.network === "testnet" ? "NEAR testnet" : "Local sandbox";
  $("#mode").textContent =
    session.network === "testnet"
      ? "Testnet funds. The operator controls the configured creator, claimant and verifier accounts."
      : "Local NEAR chain with simulated funds. New launches start a fresh chain; saved evidence stays in Past runs.";
  $("#count").textContent = session.challenges.length;
  $("#rail-count").textContent = session.challenges.length;
  $("#summary-total").textContent = session.challenges.length;
  $("#summary-review").textContent = session.challenges.filter(
    (c) =>
      c.snapshot.state.status === "claimed" &&
      !c.attempts.find((a) => a.claimId === c.snapshot.state.claim?.id)
        ?.evidence,
  ).length;
  $("#summary-paid").textContent = near(
    session.challenges
      .filter((c) => c.snapshot.state.status === "paid")
      .reduce((sum, c) => sum + BigInt(c.snapshot.state.reward), 0n),
  );
  $("#configuration").innerHTML =
    `<p><span>Contract</span><code>${esc(session.contract)}</code></p>${Object.entries(
      session.roles,
    )
      .map(
        ([role, id]) =>
          `<p><span>${esc(role[0].toUpperCase() + role.slice(1))}</span><code>${esc(id)}</code></p>`,
      )
      .join(
        "",
      )}<p><span>Claimant balance</span><strong>${esc(near(session.claimantBalance))} NEAR</strong></p><details><summary>Source identifiers</summary><p>Contract SHA-256<code>${esc(session.codeHash)}</code></p><p>Specification SHA-256<code>${esc(session.specification.sha256)}</code></p></details>`;
  $("#challenges").innerHTML = session.challenges.length
    ? session.challenges
        .toReversed()
        .map(
          (c) =>
            `<button class="challenge" data-select="${esc(c.id)}" aria-current="${c.id === selected}"><span class="challenge-icon">${icon("code")}</span><span class="challenge-content"><strong>${esc(c.title)}</strong><span class="challenge-sub"><span class="state-dot ${esc(c.snapshot.state.status)}"></span>${esc(statusName(c.snapshot.state, c.snapshot.state.claim && c.attempts.find((a) => a.claimId === c.snapshot.state.claim.id)))}</span><span class="challenge-bottom"><span>#${esc(c.id)}</span><span>${esc(near(c.snapshot.state.reward))} NEAR</span></span></span></button>`,
        )
        .join("")
    : `<div class="index-empty">${icon("file")}<strong>No challenges yet.</strong><p>Fund your first reward to get started.</p></div>`;
  document.querySelectorAll("[data-select]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.select;
        activeTab = "overview";
        saveView(true);
        render();
      }),
  );
  renderDetail();
  if (busy) lock(true);
}
function switchTab(name, focus = false) {
  activeTab = name;
  saveView(true);
  renderDetail();
  if (focus) $("#tab-" + name)?.focus();
}
function bindCreate() {
  document
    .querySelectorAll("[data-create]")
    .forEach((b) => (b.onclick = () => $("#create-dialog").showModal()));
}
function clearCandidateError() {
  $("#candidate")?.removeAttribute("aria-invalid");
  $("#candidate")?.removeAttribute("aria-describedby");
  $("#candidate-error")?.remove();
}
function bindDetail(item) {
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab, true);
    b.onkeydown = (event) => {
      const tabs = ["overview", "evidence", "activity"];
      let index = tabs.indexOf(activeTab);
      if (event.key === "ArrowRight") index = (index + 1) % 3;
      else if (event.key === "ArrowLeft") index = (index + 2) % 3;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = 2;
      else return;
      event.preventDefault();
      switchTab(tabs[index], true);
    };
  });
  document
    .querySelectorAll("[data-tab-target]")
    .forEach((b) => (b.onclick = () => switchTab(b.dataset.tabTarget, true)));
  document.querySelectorAll("[data-copy]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          notice("Identifier copied.");
        } catch {
          notice(
            "Copy is unavailable in this browser. Select the identifier to copy it.",
            "error",
          );
        }
      }),
  );
  document.querySelectorAll("[data-sample]").forEach(
    (b) =>
      (b.onclick = () => {
        const target = {
          benign: "alice",
          qualifying: "alice-backup",
          rejected: "bob",
        }[b.dataset.sample];
        const raw = JSON.stringify(
          { user: "alice", path: `/accounts/${target}/profile` },
          null,
          2,
        );
        drafts.set(item.id, raw);
        $("#candidate").value = raw;
        clearCandidateError();
        document
          .querySelectorAll("[data-sample]")
          .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }),
  );
  if ($("#candidate"))
    $("#candidate").oninput = () => {
      drafts.set(item.id, $("#candidate").value);
      clearCandidateError();
    };
  if ($("#candidate-form"))
    $("#candidate-form").onsubmit = (event) => {
      event.preventDefault();
      const raw = $("#candidate").value;
      action(
        "Submitting the candidate claim…",
        async () => {
          await api(`/api/challenges/${item.id}/claim`, { candidateRaw: raw });
          drafts.delete(item.id);
        },
        "Claim submitted. Run the verifier to check eligibility.",
        "candidate",
      );
    };
  if ($("#ai"))
    $("#ai").onclick = () => {
      if (!session.aiAvailable || busy) return;
      lock(true);
      notice("Requesting a synthetic NEAR AI candidate…", "working");
      api("/api/generate", {})
        .then((candidate) => {
          const raw = JSON.stringify(candidate, null, 2);
          drafts.set(item.id, raw);
          $("#candidate").value = raw;
          clearCandidateError();
          notice(
            "Candidate generated. Review it before submitting; no claim or payment was made.",
          );
        })
        .catch((error) => notice(error.message, "error"))
        .finally(() => lock(false));
    };
  const actions = {
    receipts: [
      "Recovering the signed transaction receipt…",
      "Receipt recovery complete.",
    ],
    verify: [
      "Running the three pinned revisions in the sandbox…",
      "Verification complete. Review the evidence before settling.",
    ],
    settle: [
      "Signing the verifier decision and waiting for finality…",
      "Verifier decision recorded. Inspect the finalized result.",
    ],
    refund: ["Refunding the expired reward…", "Reward refunded."],
    retry: [
      "Retrying the approved payout…",
      "Payout retry recorded. Inspect its finalized state.",
    ],
  };
  for (const [id, [working, success]] of Object.entries(actions))
    if ($("#" + id))
      $("#" + id).onclick = () =>
        action(
          working,
          () => api(`/api/challenges/${item.id}/${id}`, {}),
          success,
        );
  if (busy) lock(true);
}
$("#new-challenge").onclick = () => $("#create-dialog").showModal();
bindCreate();
for (const b of document.querySelectorAll(".close"))
  b.onclick = () => b.closest("dialog").close();
$("#create-form").onsubmit = (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  data.minutes = Number(data.minutes);
  $("#create-dialog").close();
  action(
    "Funding the challenge escrow…",
    async () => {
      const c = await api("/api/challenges", data);
      selected = c.id;
      activeTab = "overview";
    },
    "Challenge funded. Propose an input to test the patch.",
  );
};
$("#reward").oninput = () => {
  const value = Number($("#reward").value);
  $("#deposit-reward").textContent = Number.isFinite(value)
    ? `${value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} NEAR`
    : "—";
  $("#deposit-total").textContent = Number.isFinite(value)
    ? `${(value + 0.02).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} NEAR`
    : "—";
};
$("#refresh").onclick = () =>
  action(
    "Refreshing finalized chain state…",
    async () => {},
    "Finalized state refreshed.",
  );
$("#archives").onclick = async () => {
  try {
    const files = await api("/api/archives");
    $("#archive-list").innerHTML =
      files
        .toReversed()
        .map(
          (f) =>
            `<div class="archive-entry">${icon("file")}<div><strong>${f.startsWith("testnet-") ? "Testnet run" : "Local run"}</strong><span>${esc(f)}</span></div><a class="icon-button" href="/api/archives/${encodeURIComponent(f)}" download aria-label="Download ${esc(f)}">${icon("download")}</a></div>`,
        )
        .join("") || '<p class="muted">No saved runs yet.</p>';
    $("#archive-dialog").showModal();
  } catch (error) {
    notice(error.message, "error");
  }
};
window.addEventListener("hashchange", () => {
  if (!session) return;
  const view = new URLSearchParams(location.hash.slice(1));
  const id = view.get("challenge");
  if (session.challenges.some((c) => c.id === id)) {
    selected = id;
    activeTab = ["overview", "evidence", "activity"].includes(view.get("view"))
      ? view.get("view")
      : "overview";
    render();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (drafts.size) {
    event.preventDefault();
    event.returnValue = "";
  }
});
load().catch((error) => notice("Unable to connect: " + error.message, "error"));
