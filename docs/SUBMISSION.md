# NEAR HACKATHON submission preparation

This is a preparation record, not a submission. The live [organizer instructions](https://nearhackathon.com/HACKATHON.md) are authoritative and must be read again immediately before submitting. On 2026-11-07 they listed a deadline of 2026-11-14 23:59 UTC, required a public repository and a public X demo post, and allowed a testnet-only project. A local-only demo requires video. The organizer instructions say the human records the demo and publishes the post; the included [automated screen recording](../demo/VIDEO.md) is available for the owner to review and confirm against that requirement.

## Evidence for a reviewer

- [Public repository](https://github.com/EF-Code/patch-bounty), [development branch](https://github.com/EF-Code/patch-bounty/tree/work), and [changes from the initial concept commit](https://github.com/EF-Code/patch-bounty/compare/6dad103...main).
- [Local quickstart](QUICKSTART.md), [interactive saved-evidence walkthrough](../demo/index.html), and [full application recording](../demo/patchbounty-app-demo.mp4).
- [Application testnet run](../demo/app-testnet-20261107/README.md) with a fresh payout, expiry refund, exact candidate data and signed transaction journal.
- [Recorded testnet evidence](../demo/testnet-20261105/README.md), including the approval, replay rejection and final state. A later RPC check found the recorded code hash and paid state still matched.
- [Live synthetic NEAR AI candidate](../demo/near-ai-20261107/README.md), verified separately by the deterministic fixture verifier. This is separate from the earlier deterministic-generator payout demo.
- [AI privacy limitations](AI-VERIFICATION.md), [sandbox limits](CHALLENGE.md), and [contract trust assumptions](ESCROW.md).

## Verification on 2026-11-07

- 19 Python tests and six application service tests passed, including fixed-fixture Bubblewrap runs and a receipt-recovery test that forbids a second broadcast. The quickstart also passed from a fresh checkout on the existing host. A fresh Docker container could not provide the required namespace and `/proc` permissions and correctly failed closed.
- The 10 Rust unit tests passed with Rust 1.88.0. The pinned Rust 1.86.0 Wasm build, after Binaryen lowering, matched the deployed code's recorded SHA-256.
- The local NEAR sandbox integration rejected the benign claim, paid the qualifying claimant, and rejected a repeated approval. This environment capped open files at 16,384; a temporary wrapper limited only the local sandbox node's requested file-descriptor limit to that ceiling. It did not change the contract or fixture verifier. This is a local simulated-funds test, separate from the earlier recorded testnet payout.
- The integration harness's `tar` dependency was updated after an npm audit; a clean install and the local sandbox test passed afterwards. The remaining audit reported 13 low-severity package entries in that test toolchain and no high or critical entries. See the [testnet walkthrough](TESTNET.md) for scope and limitations.
- The full browser test started a real local chain and checked challenge creation, malformed input, benign rejection, eligible verification, exact payout, replay rejection, origin/session protections, reloads and mobile width. The application is now interactive; the earlier static walkthrough remains a historical evidence viewer.

## Remaining owner actions

1. Review the video and organizer rules, and personally publish the required public X post with the video attached, including `@NEARProtocol` and `#NEARHackathon`. A [post draft](../demo/VIDEO.md) is available. Supply the post URL for the submission.
2. Choose the project name, team lead name, contact email, team size, track IDs, public repository link, mainnet prize account, and the final description. Do not include private keys. The event permits one submission per project; use the organizer's change-request process if already submitted.
3. Review the exact contact notice and the full payload. The organizer instructions require the human's explicit confirmation of that exact payload before the API submission; consent must not be assumed. No personal details or payload should be committed to this repository.

The project is a complete non-production operator application for one fixed synthetic challenge. Do not describe its AI request as verified private inference, the sandbox as suitable for arbitrary hostile code, or the escrow as a production deployment. The contract's full-access key permits redeployment, and its verifier is trusted.
