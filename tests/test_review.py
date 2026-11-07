import json
import unittest

import review


class ReviewTests(unittest.TestCase):
    def test_review_displays_snapshot_and_escapes_untrusted_content(self):
        evidence = {"format": "patchbounty-evidence-v1", "network": "testnet", "contract": "escrow.testnet",
                    "challenge_id": "0", "chain_block": {"block_height": 10},
                    "chain_challenge": {"status": "claimed", "verifier": "v.testnet",
                                        "claim": {"claimant": "alice.testnet"}},
                    "verification": {"decision": "eligible", "candidate": {"user": "<script>alert(1)</script>"},
                                     "candidate_sha256": "a" * 64, "verifier_sha256": "b" * 64,
                                     "revisions": {name: {"allowed": True, "sha256": "c" * 64}
                                                   for name in ("vulnerable", "incomplete", "corrected")}}}
        page = review.render(json.dumps(evidence).encode())
        self.assertIn("Recorded state at block 10", page)
        self.assertIn("&lt;script&gt;", page)
        self.assertNotIn("<script>alert(1)</script>", page)

    def test_rejects_unsupported_evidence(self):
        with self.assertRaises(ValueError):
            review.render(b'{"format":"unknown"}')
