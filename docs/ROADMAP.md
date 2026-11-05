# Implementation roadmap

## 1. Fixture and verifier

- [ ] Choose one language and a small intentionally vulnerable authorization example.
- [ ] Pin vulnerable, incomplete-fix, and corrected revisions and define one exact eligibility predicate.
- [ ] Add benign, invalid, and qualifying input cases.
- [ ] Implement a deterministic verifier and a reproducible local run with bounded execution.
- [ ] Verify that the qualifying case fails the incomplete patch and does not qualify against the corrected patch.

## 2. Testnet escrow

- [ ] Specify contract state transitions, verifier authorization, payout, expiry, refund, and callback behavior.
- [ ] Implement and deploy to NEAR testnet using dedicated test accounts.
- [ ] Test successful payout, duplicate or cross-challenge replay, wrong verifier, wrong recipient, expiry, refund, and transfer failure.
- [ ] Document deployed identifiers and exact commands; never present a local mock as a deployed contract.

## 3. Candidate generation

- [ ] Add one deterministic generator and one independent AI-assisted approach.
- [ ] Integrate NEAR AI Cloud private inference with environment-based credentials.
- [ ] Document the exact privacy and attestation evidence checked, and behavior when it is unavailable.
- [ ] Separate model output from the deterministic verifier and payout authorization.

## 4. Reviewer experience

- [ ] Show challenge details, candidate input, exact revisions, evidence, verifier decision, and settlement state.
- [ ] Provide a clean-environment quickstart with explicit prerequisites and expected output.
- [ ] Record a complete demo including both rejection and accepted payout.
- [ ] Confirm applicable hackathon instructions and track choices before submission.

## Stretch goals

- [ ] Experiment with a clearly labeled NEAR Intents payout on a supported network and asset, with quote expiry, status tracking, and refund handling.
- [ ] Add a behavioral-regression challenge with a separately specified acceptance rule.
- [ ] Investigate stronger, independently attestable sandbox execution and a review or dispute process.

Never claim an unfinished or simulated component is live. Record external service and mainnet dependencies alongside local test results.
