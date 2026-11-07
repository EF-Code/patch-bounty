# Testnet walkthrough

This is an operator-run walkthrough for a fresh deployment. A previous live run is documented in the [testnet demonstration](../demo/testnet-20261105/README.md). This walkthrough spends testnet NEAR for storage, gas and the reward. Use fresh, dedicated accounts and synthetic data only. The contract is unaudited and has the limitations in [the escrow design](ESCROW.md). Do not use mainnet or real assets.

## Prerequisites

Install Python 3.10+, Bubblewrap with user/network namespaces, Node.js 18+ and npm, Rust and the `wasm32-unknown-unknown` target, and [NEAR CLI-RS](https://docs.near.org/tools/near-cli). The pinned Wasm build uses Rust 1.86.0; the locked unit-test dependencies require Rust 1.88.0 or newer. Provision separate testnet accounts for the contract, creator, verifier and claimant, with sufficient testnet NEAR for deployment, deposits and gas. The commands below use NEAR CLI-RS's legacy keychain; configure it for those accounts or choose the signing method that matches your setup. Never put keys in this repository. The contract account needs enough balance for its deployed code and storage, independently of challenge deposits.

```sh
rustup toolchain install 1.86.0 --profile minimal --target wasm32-unknown-unknown
rustup toolchain install 1.88.0 --profile minimal
cargo +1.88.0 test --manifest-path contract/Cargo.toml --locked
cd contract/integration
npm ci
npm run build:wasm
npm test
cd ../..
```

The build uses Rust 1.86 and pinned dependencies, then lowers Wasm instructions unsupported by the local NEAR runtime with Binaryen. Deploy the resulting `_near.wasm` file, not the unprocessed Rust output. The sandbox test downloads a local NEAR node and normally requires an open-file limit of at least 65,535; it uses synthetic local-chain funds.

The integration harness overrides its `near-sandbox` installer's `tar` dependency to 7.5.22 to address archive extraction advisories. On 2026-11-07, `npm audit` reported no high or critical entries and 13 low-severity package entries in the integration dependency tree, associated with the upstream `elliptic` advisory. The suggested npm remediation changes the major version of `near-workspaces`; it has not been validated. This toolchain is for local testing, not the deployed contract, and its dependency audit is not a contract security audit.

Set these variables to your dedicated accounts and inspect them before continuing:

```sh
export CONTRACT=your-contract.testnet
export CREATOR=your-creator.testnet
export VERIFIER=your-verifier.testnet
export CLAIMANT=your-claimant.testnet
near contract deploy "$CONTRACT" use-file contract/target/wasm32-unknown-unknown/release/patchbounty_escrow_near.wasm without-init-call network-config testnet sign-with-legacy-keychain send
```

Record the deployed contract account, Wasm SHA-256, transaction ID and network separately. A contract account can deploy different code later; review its actual deployed code and account permissions before trusting it.

## Fund a challenge

This example attaches 0.1 testnet NEAR: 0.02 is retained for storage and 0.08 is the reward. The deadline is one hour from local clock time. Check the chain time and allow sufficient time for all steps. `settlement.py spec` binds the on-chain challenge to the current verifier source and pinned fixture hashes.

```sh
SPEC=$(python3 settlement.py spec | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha256"])')
DEADLINE=$(python3 -c 'import time; print(time.time_ns()+3600*10**9)')
near contract call-function as-transaction "$CONTRACT" create_challenge json-args "{\"verifier\":\"$VERIFIER\",\"specification_sha256\":\"$SPEC\",\"deadline_ns\":\"$DEADLINE\"}" prepaid-gas '100 Tgas' attached-deposit '0.1 NEAR' sign-as "$CREATOR" network-config testnet sign-with-legacy-keychain send
```

Save the returned challenge ID. A new contract's first ID is `0`; the commands below use that as an example. Inspect `get_challenge` after creating it:

```sh
export CHALLENGE_ID=0
near contract call-function as-read-only "$CONTRACT" get_challenge json-args "{\"challenge_id\":\"$CHALLENGE_ID\"}" network-config testnet now
```

## Generate and submit a claim

The baseline generator outputs a data-only candidate. For the negative path, use `candidates/benign.json` in place of `/tmp/patchbounty-candidate.json`; it should be rejected by the verifier before submitting another claim.

```sh
python3 generate.py > /tmp/patchbounty-candidate.json
python3 verifier.py /tmp/patchbounty-candidate.json > /tmp/patchbounty-verification.json
CANDIDATE_SHA=$(python3 -c 'import json; print(json.load(open("/tmp/patchbounty-verification.json"))["candidate_sha256"])')
near contract call-function as-transaction "$CONTRACT" submit_claim json-args "{\"challenge_id\":\"$CHALLENGE_ID\",\"candidate_sha256\":\"$CANDIDATE_SHA\"}" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as "$CLAIMANT" network-config testnet sign-with-legacy-keychain send
```

Wait for the claim to be finalized. The verifier obtains the finalized testnet claim, checks that its candidate and specification match, reruns the fixed fixture, and writes a new evidence file. The RPC server is trusted to supply the correct finalized state; this script does not verify light-client proofs or deployed contract code. Independently verify the contract account, code and chain state before signing. The script prepares arguments only; it does not sign or broadcast a transaction.

```sh
python3 settlement.py prepare --contract "$CONTRACT" --challenge "$CHALLENGE_ID" --candidate /tmp/patchbounty-candidate.json --evidence /tmp/patchbounty-evidence.json > /tmp/patchbounty-verdict.json
cat /tmp/patchbounty-verdict.json
python3 review.py /tmp/patchbounty-evidence.json /tmp/patchbounty-review.html
```

Review the evidence, candidate, claimant, verifier and transaction arguments. The HTML is a static snapshot, not a live payment status. Evidence files are created exclusively and will not overwrite an existing file; choose new paths for each claim. For a valid but ineligible candidate the method is `reject_claim`. For an eligible candidate it is `approve_claim`.

```sh
METHOD=$(python3 -c 'import json; print(json.load(open("/tmp/patchbounty-verdict.json"))["method"])')
ARGS=$(python3 -c 'import json; print(json.dumps(json.load(open("/tmp/patchbounty-verdict.json"))["args"],separators=(",",":")))')
near contract call-function as-transaction "$CONTRACT" "$METHOD" json-args "$ARGS" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as "$VERIFIER" network-config testnet sign-with-legacy-keychain send
near contract call-function as-read-only "$CONTRACT" get_challenge json-args "{\"challenge_id\":\"$CHALLENGE_ID\"}" network-config testnet now
```

For a successful approval, inspect the transaction receipts and confirm the final state is `paid` and the recipient received the reward. Repeating the same approval must fail. A failed transfer changes the state to `approved`; anyone can call `retry_payout` for that challenge. For an unapproved challenge at or after expiry, its creator can call `refund`. Inspect callbacks and the resulting state; an accepted transaction alone does not prove a transfer succeeded.

## Optional AI proposal

Set `NEAR_AI_API_KEY` in your local environment, and optionally `NEAR_AI_MODEL`, then run `python3 generate.py --near-ai > /tmp/patchbounty-ai-candidate.json`. This sends a fixed synthetic prompt to NEAR AI Cloud and may incur provider charges. The default `z-ai/glm-5.3-flash` was listed as ready in the public model catalog on 2026-11-05; model availability can change. The model response is validated as candidate data and must still go through the same verifier. This implementation does **not** verify gateway/model attestation, TLS connection binding or response signatures, and must not be used to assert private inference or handle sensitive material. See [NEAR's verification guide](https://docs.near.ai/cloud/verification/index).

For the current checks, missing evidence and requirements for a future verified mode, see [AI verification](AI-VERIFICATION.md). HTTP failures report the status code without printing the provider response body or credential.
