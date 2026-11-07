import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import settlement
import verifier


class SettlementTests(unittest.TestCase):
    def state(self, raw):
        candidate = verifier.parse_candidate(raw)
        return {"specification_sha256": verifier.digest(settlement.canonical(settlement.specification())),
                "status": "claimed", "verifier": "verifier.testnet",
                "claim": {"id": "7", "claimant": "alice.testnet",
                          "candidate_sha256": verifier.digest(settlement.canonical(candidate))}}

    def test_eligible_preparation_binds_chain_and_evidence(self):
        raw = b'{"user":"alice","path":"/accounts/alice-backup/profile"}'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            with mock.patch.object(settlement, "fetch_challenge", return_value=(self.state(raw), {"block_height": 1, "block_hash": "test"})):
                output = settlement.prepare("escrow.testnet", 4, raw, path)
            evidence = json.loads(path.read_bytes())
            self.assertEqual(output["method"], "approve_claim")
            self.assertEqual(output["claimant"], "alice.testnet")
            self.assertEqual(output["args"]["evidence_sha256"], verifier.digest(path.read_bytes()))
            self.assertEqual(evidence["challenge_id"], "4")
            self.assertEqual(evidence["verification"]["decision"], "eligible")

    def test_ineligible_candidate_prepares_rejection(self):
        raw = b'{"user":"alice","path":"/accounts/alice/profile"}'
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.object(settlement, "fetch_challenge", return_value=(self.state(raw), {})):
                output = settlement.prepare("escrow.testnet", 0, raw, Path(directory) / "evidence.json")
        self.assertEqual(output["method"], "reject_claim")

    def test_mismatched_candidate_or_spec_fails_before_writing(self):
        raw = b'{"user":"alice","path":"/accounts/alice/profile"}'
        for field in ("candidate", "specification"):
            state = self.state(raw)
            if field == "candidate":
                state["claim"]["candidate_sha256"] = "0" * 64
            else:
                state["specification_sha256"] = "0" * 64
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "evidence.json"
                with mock.patch.object(settlement, "fetch_challenge", return_value=(state, {})):
                    with self.assertRaises(verifier.VerificationError):
                        settlement.prepare("escrow.testnet", 0, raw, path)
                self.assertFalse(path.exists())

    def test_rejects_non_testnet_contract(self):
        with self.assertRaises(verifier.VerificationError):
            settlement.prepare("escrow.near", 0, b"{}", Path("unused.json"))
