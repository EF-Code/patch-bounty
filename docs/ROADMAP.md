# Implemented project scope

The delivered non-production application is the fixed synthetic authorization challenge, its deterministic sandbox verifier, a NEAR escrow contract, and the complete operator workflow. [Application instructions](APPLICATION.md) describe setup, local execution and dedicated testnet mode.

- [x] Pin vulnerable, incomplete and corrected Python fixtures and enforce the exact eligibility predicate.
- [x] Reject malformed data, fixture changes and sandbox failures without authorizing settlement.
- [x] Run a real escrow contract locally and support dedicated testnet accounts.
- [x] Create and fund challenges, submit claims, verify, reject or approve, retry failed transfers and refund expiry.
- [x] Keep generation, verification and explicit settlement as separate operations.
- [x] Provide deterministic samples and optional synthetic-only NEAR AI generation with recorded provenance and accurate failure handling.
- [x] Provide a responsive browser interface with current finalized chain state, claim histories, evidence downloads and run exports.
- [x] Protect the local operator API against foreign origins, missing session tokens and repeated request IDs.
- [x] Exercise the workflow through the browser and retain testnet transaction evidence.
- [x] Provide a reproducible build, startup preflight, automated checks, MIT license, demo assets and submission guidance.

## Deliberate boundaries

This application accepts candidate JSON for one synthetic fixture. It does not promise general repository analysis, hostile-code hosting, autonomous disclosure, remote-user authentication, confidential/private inference, decentralized adjudication, NEAR Intents settlement, or mainnet operation. These are separate future products or production assurance work, rather than incomplete controls hidden in the delivered flow.

The operator and verifier remain trusted. The contract is unaudited and upgradeable by its account owner. Hardware attestation for inference is not implemented or claimed; the AI path uses synthetic data only. See [architecture](ARCHITECTURE.md), [challenge safety](CHALLENGE.md), [escrow limitations](ESCROW.md), and [AI evidence](AI-VERIFICATION.md).

Hackathon publication and the owner's final submission remain external to the application. Follow the [submission preparation record](SUBMISSION.md) and re-read the organizer's live instructions before sending anything.
