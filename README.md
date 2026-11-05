# PatchBounty

PatchBounty is a proposed marketplace for challenging security patches with reproducible counterexamples. A maintainer funds a challenge, independent agents look for a test that breaks the patch, and a verifier checks the result before an escrow releases a reward.

**Status: concept and implementation plan.** This repository does not yet contain a working prototype, deployed contracts, a sandbox, or a live payment integration.

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

Start with the vulnerable fixture and deterministic verifier, then build the testnet escrow. Do not build a general autonomous hacking platform. Use intentionally vulnerable, synthetic fixtures and only test systems for which you have authorization.

## Hackathon context

The initial target is NEAR HACKATHON, particularly AI Swarms, AI Security & Defense, and Agent Economy. Confirm current eligibility and submission requirements in the [official event instructions](https://nearhackathon.com/HACKATHON.md) before submitting. This repository is not itself a hackathon submission.

## References

- [NEAR documentation](https://docs.near.org/)
- [NEAR AI Cloud private inference](https://docs.near.ai/cloud/private-inference)
- [NEAR AI Cloud verification](https://docs.near.ai/cloud/verification/index)
- [NEAR Intents 1Click request flow](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request)
