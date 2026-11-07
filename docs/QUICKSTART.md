# Local quickstart

This walkthrough runs the deterministic synthetic challenge locally. It does not call an AI service, connect to NEAR, or pay a reward.

## Prerequisites

- Linux with Python 3.10 or newer and Bubblewrap (`bwrap`). Python's standard library is sufficient.
- Permission to create unprivileged user and network namespaces. Some container hosts disable them; the verifier reports an error and does not fall back to running fixtures on the host.
- The Python base runtime and `/usr`, `/lib`, and `/lib64` must be available to Bubblewrap. The fixture and verifier assumptions are described in the [challenge specification](CHALLENGE.md).

Clone the repository and select `work`, or run these commands from an existing checkout of that branch:

```sh
git clone --branch work https://github.com/EF-Code/patch-bounty.git
cd patch-bounty
TASK_DIR=$(mktemp -d)
python3 generate.py > "$TASK_DIR/candidate.json"
python3 verifier.py "$TASK_DIR/candidate.json" > "$TASK_DIR/eligible.json"
python3 verifier.py candidates/benign.json > "$TASK_DIR/benign.json"
python3 review.py "$TASK_DIR/eligible.json" "$TASK_DIR/review.html"
python3 -c 'import json,sys; print("eligible:", json.load(open(sys.argv[1]))["decision"]); print("benign:", json.load(open(sys.argv[2]))["decision"])' "$TASK_DIR/eligible.json" "$TASK_DIR/benign.json"
```

The review command prints the path it wrote. The final two lines should be:

```text
eligible: eligible
benign: not_eligible
```

Open `review.html` in the printed temporary directory to inspect the candidate, fixture outcomes and hashes. The page is a static view of unsigned local evidence and has no settlement state. A valid but ineligible input still exits 0; use the `decision` field. An invalid input, integrity failure, unavailable sandbox, or fixture failure produces an `error` decision and exits 2. Redirected error output is JSON, but it is not a successful verdict and cannot be rendered as one.

Run the Python checks with `python3 -m unittest discover -s tests -v`. They include actual sandbox runs and therefore require the same namespace support. For a NEAR testnet workflow, see the separate [testnet walkthrough](TESTNET.md); its prerequisites and use of testnet funds are different. For the optional AI generator and its unverified privacy status, see [AI verification](AI-VERIFICATION.md).

The commands through the final decision check were exercised on 2026-11-07 from a fresh local clone in the existing Linux environment, using Python 3.12.14 and the installed Bubblewrap. This was a clean checkout, not a test on a newly provisioned operating system.

A separate fresh `python:3.12-slim-bookworm` container with Bubblewrap returned a sandbox error under Docker's default security profile because it could not create the required namespaces. With that profile relaxed for the test, the container still could not mount `/proc`; it failed closed in both cases. A normal Docker container should therefore not be assumed to satisfy the namespace prerequisites.
