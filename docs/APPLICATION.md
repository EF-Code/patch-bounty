# Running the application

PatchBounty is a complete, single-operator application for the fixed synthetic authorization challenge. Its browser interface creates challenges, proposes and submits candidate data, runs the sandboxed verifier, authorizes rejection or payout, refunds expired rewards, retries failed payouts, and exports evidence. The local mode runs the real Rust escrow contract in a local NEAR node with simulated funds. Testnet mode uses dedicated accounts and an actual testnet deployment. It never uses mainnet.

## Prerequisites

Use a native Linux environment with Python 3.10+, Bubblewrap and permission to create user/network/PID namespaces and mount the sandbox's `/proc`. Install Node.js 22.21+ with npm and Rustup. The scripts use `~/.venv/bin/python` when available, otherwise `python3`; set `PATCHBOUNTY_PYTHON` to choose another interpreter. No Python packages are required. GCC is needed only for the optional descriptor-limit compatibility mode.

A default Docker container may block the namespaces and mounts needed by Bubblewrap. Startup performs an actual verifier preflight and refuses to run when isolation is unavailable. Do not remove that check or execute the fixtures on the host to work around it.

## Install and start

From a checkout of the repository:

```sh
scripts/setup.sh
scripts/start.sh
```

The setup script installs the pinned Rust toolchains and npm dependencies and builds the Wasm contract. Startup deploys that build to a fresh local chain and prints `http://127.0.0.1:3000`. Open that exact address in a browser. It binds only to loopback and rejects other Host and Origin values. Do not expose it as a public multiuser server.

The local node normally requests a hard open-file limit of 65,535. On a constrained host, startup explains the limitation. For this small synthetic demo, explicitly opt into:

```sh
scripts/start.sh --low-fd
```

That mode compiles a temporary compatibility shim used **only by the trusted local NEAR node**. It clamps the node's requested descriptor limit to the host's real ceiling, without changing other limits. It is never loaded into the verifier. It is a demo compatibility mode, not a configuration for operating a production node. Temporary wrapper files are removed on shutdown.

## Complete workflow

1. Click **Create challenge**, choose a title, reward and duration, and click **Fund challenge**. The configured creator deposits the reward plus the contract's 0.02 NEAR storage allowance. The app waits for finalized state.
2. Choose **Benign sample** and **Submit claim**. Click **Run sandboxed verifier**. All three revisions allow access to Alice's own profile, so the result is ineligible. Click **Reject claim**; the contract reopens the challenge.
3. Choose **Qualifying sample** and submit it. The verifier shows that both vulnerable revisions allow Alice to access Alice-backup's profile and that the corrected revision denies it.
4. Inspect or download the exact evidence. Click **Approve reward payout**. The server re-verifies the candidate and evidence, binds them to the on-chain claim and specification, then signs as the dedicated verifier. It waits for finality, displays the resulting contract state, balance change and receipts, and blocks a duplicate settlement.
5. For an unapproved challenge, wait until its deadline and refresh. **Refund expired reward** returns the reward to the creator. A failed approved transfer exposes **Retry payout**, always using the recorded claimant.
6. **Export run** downloads the full public journal. **Past runs** provides previous journals. Local chains start fresh on each launch; old journals preserve evidence rather than pretending their chains are still running. Testnet restarts resume the local journal for the same contract and roles.

The operator controls all three roles in this demonstration; it is not an authentication system for independent remote users. Candidate submissions are bounded JSON data, never code, paths to execute, or arbitrary repository URLs. Evidence includes the exact candidate bytes, canonical input hash, pinned fixture hashes, verifier and runtime identifiers, on-chain snapshots and transaction results. Successful verification evidence also records application source hashes. Journals are unsigned local records, not hardware attestations.

## Optional AI proposal

Configure `NEAR_AI_API_KEY` securely in the server environment before starting. The UI enables **Generate with NEAR AI** when the key is available. It sends the fixed synthetic prompt, validates the output as candidate data and fills the input for the operator to review. It does not submit a claim or settle a reward. Model and prompt identifiers and explicit unverified attestation/signature status are recorded in the journal. No API key is returned to the browser or written to the run journal. Provider errors appear as errors; samples and manual candidates remain available.

This integration makes no promise of private inference. It accepts synthetic data only. The missing hardware-attestation guarantees and the requirements for a future confidential workflow are described in [AI verification](AI-VERIFICATION.md).

## Dedicated testnet mode

To create fresh faucet-funded accounts and deploy the contract, run this explicit testnet command once:

```sh
npm --prefix contract/integration run provision:testnet
```

It stores account keys under `~/.near-credentials/testnet` and writes its account configuration to `~/.config/patchbounty/testnet.json`, outside the repository. It prints the command to start the app. With that default configuration location:

```sh
PATCHBOUNTY_TESTNET_CONFIG="$HOME/.config/patchbounty/testnet.json" scripts/start.sh --testnet-spending-authorized
```

The faucet is an external service and may reject requests or be unavailable. Provisioning refuses to overwrite an existing configuration. Do not repeatedly request funding to bypass service limits. If provisioning is interrupted, account keys already created remain in the external key directory for recovery; it never prints private keys. The app can also use an existing external configuration with `contract`, `creator`, `verifier`, `claimant`, and an absolute `keysDirectory`; all account names must end in `.testnet`, the signing roles must be distinct, and keys must reside outside the repository. Use dedicated test accounts only.

Testnet startup requires the explicit spending flag, loads keys only on the server, and verifies the deployed code hash against the local Wasm before every signed call. The contract account may still have a full-access key and can be upgraded later. The RPC is trusted for finalized state; the app does not verify light-client proofs. Keep testnet accounts funded for gas and deposits. The [operator walkthrough](TESTNET.md) covers direct CLI use independently of the app.

## Verification

```sh
python3 -m unittest discover -s tests -v
cargo +1.88.0 test --manifest-path contract/Cargo.toml --locked
npm --prefix contract/integration run test:app
npm --prefix contract/integration exec playwright install chromium
npm --prefix contract/integration run test:browser
```

The browser check starts and stops its own local app and real chain on port 3007, strips testnet and AI credentials from that subprocess, and checks challenge creation, malformed input, rejection, verification, payout, replay, request protection, reloads and mobile width. It uses the explicit low-descriptor demo mode when required. Set `PATCHBOUNTY_BROWSER` to an installed Chromium executable to use it instead of the Playwright download. The service tests use a fake chain to exercise failure paths but run the actual sandbox verifier; the browser test supplies the real-chain evidence. The existing `npm test` in `contract/integration` exercises the contract harness independently.

Journals and runtime files live under ignored `.patchbounty/`. Preserve exports before deleting that directory. Do not share private account keys or environment credentials. Never use real production assets with this operator application.
