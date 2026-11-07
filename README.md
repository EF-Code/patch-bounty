# PatchBounty

PatchBounty is a proposed marketplace for challenging security patches with reproducible counterexamples. A maintainer funds a challenge, independent agents look for a test that breaks the patch, and a verifier checks the result before an escrow releases a reward.

**Status: testnet prototype.** A synthetic fixture, deterministic sandboxed verifier, NEAR escrow contract, candidate generators, and evidence review tools are implemented. A real testnet payout, replay rejection, failed-transfer retry and expiry refund have been verified. A live NEAR AI Cloud request produced a candidate accepted by the deterministic verifier; inference attestation and response signatures were not verified. See the [run evidence](demo/near-ai-20261107/README.md).

The [testnet demonstration](demo/testnet-20261105/README.md) identifies the deployed contract, transactions and saved evidence. It uses faucet-funded testnet NEAR and a deterministic generator; it is not a production deployment.

## Run the local verifier

Prerequisites: Linux, Python 3.10 or newer, and `bwrap` (Bubblewrap) with unprivileged user and network namespaces enabled. The verifier requires `/usr`, `/lib`, and `/lib64` and executes only the three pinned Python fixtures. It does not accept submitted code. On systems that disallow the required namespaces, it fails closed rather than running on the host.

```sh
python3 verifier.py candidates/qualifying.json
python3 verifier.py candidates/benign.json
python3 verifier.py candidates/rejected.json
python3 verifier.py candidates/invalid.json
python3 -m unittest discover -s tests -v
```

The first candidate returns `eligible`: the vulnerable and incomplete revisions allow Alice to access Alice-backup's profile, while the corrected revision denies it. The next two return `not_eligible`. The invalid candidate returns `error` and exit code 2. A valid but ineligible candidate exits 0; check `decision`, not the exit code, for eligibility. Each successful run emits the candidate, SHA-256 identifiers, per-revision output and exit status, and the decision as JSON. Capture the JSON to retain the evidence; no evidence store or payment authorization exists yet.

The runner removes inherited environment variables, disables network access in a namespace, mounts the Python runtime and system libraries read-only, uses a temporary filesystem, and applies CPU, memory, output-file and wall-time bounds. These controls reduce risk for this fixed synthetic fixture; they are not a security guarantee for arbitrary hostile code. See [the challenge specification](docs/CHALLENGE.md) for the predicate and evidence limitations.

To create a standalone review of a successful local run, save the verifier output and render it with `python3 review.py /tmp/patchbounty-verification.json /tmp/patchbounty-review.html`. The output path must be new. This local review has no chain state; the same tool also renders the settlement evidence described in the testnet walkthrough.

The contract's local tests run with `cargo test --manifest-path contract/Cargo.toml --locked`. The [testnet walkthrough](docs/TESTNET.md) also includes the pinned Wasm build and local NEAR sandbox integration test. The local test uses simulated funds and is not evidence of a testnet payout.

## The first demo

1. A maintainer selects a deliberately vulnerable fixture and an incomplete patch, specifies the challenge rules, and funds a testnet reward.
2. Independent agents propose inputs that expose an explicitly defined security property or behavioral regression.
3. A verifier runs the candidate against exact vulnerable and patched revisions in an isolated environment.
4. A qualifying counterexample is recorded with its evidence, and the authorized verifier submits the result for escrow payout.
5. The same test is run against a corrected patch to demonstrate that it no longer qualifies.

The AI proposes tests; it does not decide whether to pay. The first implementation should use a deterministic verifier for one narrowly defined fixture.

## Why NEAR

- **NEAR testnet:** challenge escrow and payout, with a clearly identified verifier and refund path.
- **NEAR AI Cloud:** private inference for generating candidate tests from sensitive patch material; verify the evidence the service actually supports.
- **NEAR Intents:** optional cross-chain payout experiment after the core workflow works. Do not imply that testnet swaps exist or that simulated transfers are live.

## Build from here

- [Product and demo scope](docs/PRODUCT.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Implementation roadmap and acceptance checks](docs/ROADMAP.md)
- [Handoff for continuing development](HANDOFF.md)

See the [testnet walkthrough](docs/TESTNET.md) for contract builds, account prerequisites, claim verification and settlement. The optional NEAR AI generator requires an API key and may incur charges; it does not verify inference attestation. Do not build a general autonomous hacking platform. Use intentionally vulnerable, synthetic fixtures and only test systems for which you have authorization.

## Hackathon context

The initial target is NEAR HACKATHON, particularly AI Swarms, AI Security & Defense, and Agent Economy. Confirm current eligibility and submission requirements in the [official event instructions](https://nearhackathon.com/HACKATHON.md) before submitting. This repository is not itself a hackathon submission.

## References

- [NEAR documentation](https://docs.near.org/)
- [NEAR AI Cloud private inference](https://docs.near.ai/cloud/private-inference)
- [NEAR AI Cloud verification](https://docs.near.ai/cloud/verification/index)
- [NEAR Intents 1Click request flow](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request)
