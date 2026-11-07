import io
import json
import unittest
from unittest import mock

import generate
import verifier


class GeneratorTests(unittest.TestCase):
    def test_baseline_is_eligible(self):
        result = verifier.verify(json.dumps(generate.baseline()).encode())
        self.assertEqual(result["decision"], "eligible")

    def test_missing_key_fails_closed(self):
        with mock.patch.dict(generate.os.environ, {}, clear=True):
            with self.assertRaisesRegex(verifier.VerificationError, "NEAR_AI_API_KEY"):
                generate.near_ai()

    def test_cloud_candidate_is_parsed_and_validated(self):
        payload = json.dumps({"choices": [{"message": {"content": json.dumps(generate.baseline())}}]}).encode()
        response = io.BytesIO(payload)
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch.dict(generate.os.environ, {"NEAR_AI_API_KEY": "test"}, clear=True):
            with mock.patch.object(generate.urllib.request, "build_opener", return_value=opener):
                self.assertEqual(generate.near_ai(), generate.baseline())
        request = opener.open.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(body["model"], "z-ai/glm-5.3-flash")
        self.assertEqual(body["response_format"], {"type": "json_object"})

    def test_cloud_cannot_return_code_or_invalid_candidates(self):
        payload = json.dumps({"choices": [{"message": {"content": "print('not JSON')"}}]}).encode()
        opener = mock.Mock()
        opener.open.return_value = io.BytesIO(payload)
        with mock.patch.dict(generate.os.environ, {"NEAR_AI_API_KEY": "test"}, clear=True):
            with mock.patch.object(generate.urllib.request, "build_opener", return_value=opener):
                with self.assertRaises(verifier.VerificationError):
                    generate.near_ai()
