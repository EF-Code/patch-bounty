# Implementation roadmap

## 1. Fixture and verifier

- [x] Choose one language and a small intentionally vulnerable authorization example.
- [x] Pin vulnerable, incomplete-fix, and corrected revisions and define one exact eligibility predicate.
- [x] Add benign, invalid, and qualifying input cases.
- [x] Implement a deterministic verifier and a reproducible local run with bounded execution.
- [x] Verify that the qualifying case fails the incomplete patch and does not qualify against the corrected patch.

## 2. Testnet escrow

- [x] Specify contract state transitions, verifier authorization, payout, expiry, refund, and callback behavior.
- [x] Implement the contract and exercise a payout and replay rejection on a local NEAR sandbox with synthetic funds.
- [x] Implement and deploy to NEAR testnet using dedicated test accounts.
- [x] Test successful payout, duplicate or cross-challenge replay, wrong verifier, wrong recipient, expiry, refund, and transfer failure (unit tests plus live testnet checks; see the demo record).
- [x] Document deployed identifiers and exact commands; never present a local mock as a deployed contract.

## 3. Candidate generation

- [x] Add one deterministic generator and one independent AI-assisted approach (the AI integration still needs a live account test).
- [ ] Integrate NEAR AI Cloud private inference with environment-based credentials.
- [ ] Document the exact privacy and attestation evidence checked, and behavior when it is unavailable.
- [ ] Separate model output from the deterministic verifier and payout authorization.

## 4. Reviewer experience

- [x] Show challenge details, candidate input, exact revisions, evidence, verifier decision, and the recorded settlement state in a static review page.
- [ ] Provide a clean-environment quickstart with explicit prerequisites and expected output.
- [ ] Record a complete demo including both rejection and accepted payout.
- [ ] Confirm applicable hackathon instructions and track choices before submission.

## Stretch goals

- [ ] Experiment with a clearly labeled NEAR Intents payout on a supported network and asset, with quote expiry, status tracking, and refund handling.
- [ ] Add a behavioral-regression challenge with a separately specified acceptance rule.
- [ ] Investigate stronger, independently attestable sandbox execution and a review or dispute process.

Never claim an unfinished or simulated component is live. Record external service and mainnet dependencies alongside local test results.
