# Product and demo scope

## Problem

Security patches can look convincing while leaving an edge case exploitable or breaking legitimate behavior. Maintainers need independently reproducible evidence about a proposed fix, and researchers need a clear path to compensation for useful counterexamples.

## Core participants

- **Maintainer:** defines a bounded challenge and funds its reward.
- **Challenger:** submits a candidate test and a reward destination. A challenger may be a human or an agent.
- **Verifier:** executes the published challenge rules and reports an eligible result. For the first prototype this is a trusted, explicitly identified service, not a decentralized consensus system.

## First challenge

Use a small synthetic authorization function with three pinned revisions: vulnerable, incompletely patched, and corrected. Publish a precise property and fixture. A qualifying candidate must reproduce the specified failure on the vulnerable revision and the incomplete patch; it must not qualify on the corrected revision. Include benign inputs to show intended behavior.

A later challenge type may reward behavioral regressions. Define its own predicate before enabling payout; a generic test failure is not enough.

## Demo narrative

1. Fund a challenge for the incomplete patch with testnet funds.
2. Show two independent approaches proposing candidates.
3. Show the verifier rejecting an irrelevant or malformed candidate.
4. Run the qualifying input on the pinned revisions and display the deterministic trace.
5. Show the escrow accepting the verifier's authorized result and paying once.
6. Replay the same result to demonstrate rejection; show that the corrected patch does not satisfy the payout predicate.

If the escrow or inference integration is simulated, say so clearly and separately from what is live.

## Out of scope for the first demo

Arbitrary repository execution, live target scanning, production secret ingestion, autonomous disclosure, general exploit generation, decentralized adjudication, and claims of production-ready isolation or censorship resistance. Cross-chain payout is a stretch goal.

## Success criteria

A reviewer can follow reproducible instructions, inspect the exact input and revision identifiers, run the verifier, see both accepted and rejected cases, and verify a testnet payout and replay rejection. A short recorded walkthrough should show the same end-to-end flow.
