# UI verification — 2026-11-13

The redesign is implemented in the working application. The escrow contract, verifier predicate and explicit settlement authorization remain unchanged. The new UI uses a task-focused review layout, self-hosted Instrument Sans and IBM Plex Mono, real session counts, and separate Overview, Evidence and Activity tabs.

## Captured workflow

Screenshots were captured from the actual local NEAR chain, then inspected. Local funds are simulated; the screenshots are not presented as testnet transaction evidence. The older [testnet journal](../../demo/app-testnet-20261107/README.md) remains the separate source for testnet settlement.

| Step | Screen | Result |
| --- | --- | --- |
| 1 | Empty workspace | Explains the actual prefix-check difference; both creation controls work. |
| 2 | Funding dialog | Labeled fields, visible reward/storage total and native modal keyboard behavior. |
| 3 | Candidate proposal | Working samples, editable JSON and clear AI availability. |
| 4 | Invalid input | Duplicate keys rejected; inline error is associated with and focuses the input. |
| 5 | Verified counterexample | Actual revision outcomes, exact evidence download and an unobscured payout action. |
| 6 | Paid result | Real local-chain callback state, exact reward and recorded balance change. |
| 7 | Evidence | Both claims, original inputs, identifiers and transaction receipts remain available. |
| 8 | Activity | Recorded claim and verifier actions; no invented timestamps. |
| 9 | Mobile settlement | Full workflow remains usable at narrow widths. |
| 10 | Mobile evidence | Long hashes and receipt content stay inside their containers. |
| 11 | Past runs | Real exports are available in an accessible modal. |
| 12 | Expiry/refund | The real local-chain refund completes; the UI does not falsely mark verification as completed. |

The automated browser test verifies funding, malformed input, benign rejection, qualifying verification, an exact 0.08 local NEAR payout, replay rejection, origin/session protections, keyboard tab navigation, draft retention, URL deep links and evidence downloads. An opt-in run also checks expiry/refund end to end. Before this design change, the funded view looked like [this](../../demo/ui-before.png); the new [proposal](../../demo/ui-proposal.png), [verification](../../demo/app-verification.png), [paid](../../demo/app-paid.png), [mobile](../../demo/app-mobile.png), [funding](../../demo/ui-funding.png) and [evidence](../../demo/ui-evidence.png) views are retained as examples.

Automated axe checks run with WCAG 2 A/AA and WCAG 2.1 AA tags on the 12 captured states. Separate visual-only API fixtures exercise rare retry, pending callback, missing candidate and missing receipt states, with all browser writes blocked. Those fixtures do not fabricate payout proof or replace the real-chain workflow.

Additional responsive checks cover 320, 360, 390, 768, 1024, 1280 and 1440 px. The narrowest navigation was corrected after a 320 px overflow check. Success notifications were moved away from the payout control, and the test checks that the approval can be clicked immediately rather than waiting for a notification to disappear.

## Repeat the checks

```sh
PATCHBOUNTY_BROWSER=/usr/bin/chromium npm --prefix contract/integration run test:browser
PATCHBOUNTY_CHECK_REFUND=1 PATCHBOUNTY_BROWSER=/usr/bin/chromium npm --prefix contract/integration run test:browser
```

Omit `PATCHBOUNTY_BROWSER` to use an installed Playwright Chromium instead. Set `PATCHBOUNTY_SCREENSHOTS` to a local directory to retain the real workflow captures. Screenshot capture returns to the top of the actual page and clears probe focus; it does not replace or hide any page content.

The 19 Python tests and six application service tests were also rerun for this change. The unchanged Rust contract was not rebuilt or redeployed for a UI change. The npm audit still reports 13 low-severity dependency entries and no high or critical entries.

## Limits

Automated accessibility checks and keyboard checks do not establish full accessibility conformance. Screen-reader testing and every browser/assistive-device combination were not performed. No new private-inference or production-security claim is made. The interface remains a single-operator synthetic-fixture tool with local-chain and dedicated-testnet modes.
