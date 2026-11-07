import json
from pathlib import Path
import subprocess
import unittest
from unittest import mock

import verifier


ROOT = Path(__file__).resolve().parents[1]


class CandidateTests(unittest.TestCase):
    def test_rejects_malformed_and_ambiguous_inputs(self):
        bad = [b"not json", b'{"user":"alice","user":"bob","path":"/accounts/bob/profile"}',
               b'{"user":"alice","path":"/accounts/bob/profile","extra":1}',
               b'{"user":"ALICE","path":"/accounts/bob/profile"}',
               b'{"user":"alice","path":"/accounts/../profile"}',
               b"x" * (verifier.MAX_INPUT + 1)]
        for raw in bad:
            with self.subTest(raw=raw[:100]), self.assertRaises(verifier.VerificationError):
                verifier.parse_candidate(raw)

    def test_no_unsandboxed_fallback(self):
        with mock.patch.object(verifier.shutil, "which", return_value=None):
            with self.assertRaisesRegex(verifier.VerificationError, "no host fallback"):
                verifier.verify(b'{"user":"alice","path":"/accounts/alice/profile"}')

    def test_mismatched_revision_fails_closed(self):
        with mock.patch.dict(verifier.REVISIONS, {"vulnerable": "0" * 64}):
            with self.assertRaisesRegex(verifier.VerificationError, "digest mismatch"):
                verifier.verify(b'{"user":"alice","path":"/accounts/alice/profile"}')

    def test_sandbox_timeout_fails_closed(self):
        with mock.patch.object(verifier.subprocess, "run", side_effect=subprocess.TimeoutExpired("bwrap", 3)):
            with self.assertRaisesRegex(verifier.VerificationError, "timed out") as caught:
                verifier.run_revision("bwrap", Path("/runtime"), "bin/python", Path("/fixture"), b"{}")
            self.assertEqual(caught.exception.details["outcome"], "TimeoutExpired")

    def test_fixture_failure_retains_revision_evidence(self):
        raw = b'{"user":"alice","path":"/accounts/alice/profile"}'
        with mock.patch.object(verifier, "run_revision", side_effect=verifier.VerificationError("failed", {"exit_code": 1})):
            with self.assertRaises(verifier.VerificationError) as caught:
                verifier.verify(raw)
        self.assertEqual(caught.exception.details["failed_revision"], "vulnerable")
        self.assertEqual(caught.exception.details["exit_code"], 1)
        self.assertEqual(caught.exception.details["fixture_sha256"], verifier.REVISIONS["vulnerable"])


class SandboxIntegrationTests(unittest.TestCase):
    def test_examples_and_evidence(self):
        cases = [
            ("qualifying", "eligible", (True, True, False)),
            ("benign", "not_eligible", (True, True, True)),
            ("rejected", "not_eligible", (False, False, False)),
        ]
        for filename, decision, expected in cases:
            with self.subTest(candidate=filename):
                raw = (ROOT / "candidates" / (filename + ".json")).read_bytes()
                result = verifier.verify(raw)
                self.assertEqual(result["decision"], decision)
                self.assertEqual(tuple(result["revisions"][name]["allowed"] for name in
                                       ("vulnerable", "incomplete", "corrected")), expected)
                self.assertEqual(result["candidate_input_sha256"], verifier.digest(raw))
                for name, expected_hash in verifier.REVISIONS.items():
                    revision = result["revisions"][name]
                    self.assertEqual(revision["sha256"], expected_hash)
                    self.assertEqual(revision["exit_code"], 0)
                    self.assertEqual(json.loads(revision["stdout"]), {"allowed": revision["allowed"]})


if __name__ == "__main__":
    unittest.main()
