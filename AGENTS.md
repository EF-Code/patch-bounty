# Project instructions

- Use `~/.venv/` as the default Python environment. If it is unavailable, say so and resolve the environment before running Python.
- This repository begins as a concept. Distinguish implemented behavior from proposals and simulations in all documentation and demos.
- Keep the first implementation narrow: synthetic, intentionally vulnerable fixtures; one language; one deterministic verifier; and NEAR testnet escrow.
- AI-generated analysis may suggest a test, but must not by itself authorize a payment.
- Treat submitted code and inputs as untrusted. Design and document isolation before executing them; do not run arbitrary submissions on the host or against systems without authorization.
- Preserve exact revision, fixture, verifier, and execution evidence for every result. Never equate private inference attestation with proof that the sandbox, application, or AI judgment is correct.
- Keep credentials out of the repository. Do not deploy to mainnet or spend funds without the owner's authorization.
- Run meaningful checks for changes and report what was and was not verified.
