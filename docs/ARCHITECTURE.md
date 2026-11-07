# Architecture and trust boundaries

The fixed synthetic fixture and local verifier are implemented as described in [the challenge specification](CHALLENGE.md). Candidate generators, an escrow contract and a static evidence viewer are also implemented. The full browser operator application is implemented as described in [application instructions](APPLICATION.md). A [testnet deployment and payout](../demo/testnet-20261105/README.md) and a [live AI API request](../demo/near-ai-20261107/README.md) have been exercised; inference privacy and attestation remain unverified. The list below describes the end-to-end architecture.

## Components

1. **Challenge definition:** binds a challenge ID, fixture and exact revisions, verifier version or digest, acceptance predicate, reward, deadline, and payout policy.
2. **Candidate generator:** proposes bounded inputs using independent strategies. NEAR AI Cloud may be used for private inference; a deterministic baseline should remain available for reproducibility.
3. **Runner:** executes only the approved synthetic fixture with a candidate input in a constrained environment and captures exit status, output, resource-limit outcomes, and relevant hashes.
4. **Verifier:** checks the challenge-specific predicate and produces a result bound to the challenge, candidate, revision identifiers, verifier version, and reward recipient.
5. **Escrow contract:** accepts only an authorized verifier's result for the matching challenge, enforces a one-time payout, and provides a deadline and refund route.
6. **Evidence viewer:** shows the challenge, candidate, trace, verifier identity, result, and transaction status.

## Trust model

The first version trusts the maintainer to define the challenge, the verifier to implement and report the predicate honestly, and the sandbox and its operator to isolate the test. The contract cannot determine whether a software vulnerability exists; it can enforce authorization and settlement against an accepted verifier result.

NEAR AI inference attestation, where verified, establishes only the documented properties of that inference path. It does not attest a separate runner, guarantee complete inputs, prove model output correct, or protect information disclosed by the application or published on-chain. Follow the provider's verification policy and explicitly report unavailable evidence.

The current implementation's checks, missing evidence, and requirements for a future verified mode are documented in [AI verification](AI-VERIFICATION.md).

## Execution safety

Treat every candidate and fixture as untrusted. For the MVP, use a fixed allowlist of locally provided fixtures and a structured input format, rather than accepting arbitrary scripts or repositories. Design isolation before executing candidates: no production credentials, tightly limited resources and time, no unnecessary network, and explicit cleanup. Containers alone should not be claimed to be a complete hostile-code security boundary. Failure or timeout is not a valid counterexample unless the challenge explicitly says so.

## Escrow invariants

- A challenge has one creator, one reward, one verifier authority, one deadline, and an explicit state.
- A verifier result is bound to the contract, network, challenge, recipient, and evidence digest; it cannot be reused for another challenge.
- A challenge pays at most once; invalid, unauthorized, late, malformed, and replayed results fail.
- Expired challenges have a defined refund path, including failed transfers or callbacks under the chain's asynchronous execution model.
- The contract never treats an LLM response as proof; the verifier's decision is a trusted assertion in the MVP.

The implementation must specify exact state transitions, serialization and signing rules, callbacks, and boundary conditions before deployment.

## Privacy and evidence

Keep sensitive challenge material off-chain. A public chain exposes transaction metadata, so do not claim end-to-end privacy. Hashes of low-entropy or guessable material can leak information; use an appropriate commitment scheme or avoid publishing a digest when its disclosure is unsafe. Use synthetic data in the demo.

## Operator application

The loopback-only Node server orchestrates three dedicated roles on the actual contract. It serializes mutations, checks Host/Origin and a per-session request token, deduplicates request IDs, binds claims to the pinned specification, and reruns the verifier before settlement. Candidate bytes, application source fingerprints, chain snapshots and public receipts are stored in ignored local journals and available as explicit exports. Testnet signing hashes are recorded before broadcast, and receipt recovery never resends an approval. Signing keys and inference credentials stay outside the browser and exported evidence. This is a single-operator local tool, not a public multiuser service.
