# Frontend redesign — 2026-11-13

The existing operator app is the visual target and functional baseline. Its subject is patch review: compare exact behavior, inspect a candidate, then authorize a bounded reward. The audience is a technical maintainer or reviewer, rather than a landing-page visitor.

## Before observations

Captured the empty workspace, funding dialog and a funded challenge on the actual local chain. The large slogan delays the task. Similar green panels flatten the hierarchy; the input, verification and historical evidence accumulate in one long column. Long hashes and implementation text compete with the operator's next action. Keyboard and contrast checks require interactive testing, not screenshots alone.

## Design plan

- Palette: ink `#1D253E`, canvas `#F5F6FA`, white `#FFFFFF`, action blue `#4D5FEF`, muted text `#69738C`, confirmation green `#16734F`.
- Typography: self-hosted Instrument Sans for the interface and IBM Plex Mono only for code and exact identifiers. Sentence-case labels, no decorative eyebrow labels or oversized marketing headline.
- Layout: a quiet ink navigation rail, a compact workspace heading, a challenge index and a spacious review surface. Left alignment throughout. An actual patch comparison provides the visual identity, rather than illustration or decoration unrelated to the task.

```text
Navigation | Workspace heading                  Create challenge
           | Actual run counts
           | Challenge index | Title / reward / deadline
           |                 | Propose — Verify — Settle
           |                 | Overview / Evidence / Activity
           |                 | Candidate + patch comparison or result
```

The subject-specific visual feature is the authorization comparison: the incomplete prefix check against the corrected complete-account check. Status colors describe real outcomes. Every displayed challenge, count, reward and receipt comes from the current session; no invented market activity or inactive navigation is added.

## Review of the plan

A generic dashboard with decorative summary cards would repeat the initial problem. The revised plan uses a restrained inline run summary, direct task copy, and a patch comparison that explains this precise challenge. The dark/acid-green palette is replaced; green is reserved for outcomes. Evidence moves behind a real tab so that the current action stays prominent.

## Constraints and verification

Preserve APIs, exact evidence and explicit payment authorization. Keep secrets off the client, retain synthetic-only AI messaging, and preserve all error and recovery states. Verify empty, funding, proposal, error, verified, paid, refund, archive, evidence and mobile views; run the real local-chain browser test. Honor reduced motion, visible keyboard focus, accessible dialogs/tabs, and narrow screens.

Installed design guidance: `.agents/skills/frontend-design`, copied with its Apache 2.0 license from anthropics/skills commit `2c5958ecac7cee2b583967a2c4981d0f4a75c579`. Fonts are self-hosted with their OFL licenses; the app makes no font-service request at runtime.
