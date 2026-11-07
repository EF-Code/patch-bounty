#!/usr/bin/env python3
"""Propose data-only candidates for the fixed synthetic challenge."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

from verifier import VerificationError, parse_candidate

GATEWAY = "https://cloud-api.near.ai/v1/chat/completions"
PROMPT = """For a synthetic authorization test, return ONLY a JSON object with keys
user and path. Account names start with a lowercase letter and contain at most
32 lowercase letters, digits, or hyphens. The path is /accounts/<account>/profile.
The incomplete check permits a profile when its account name starts with user.
Suggest an input that accesses a different account despite this check. Do not
include markdown or explanation."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def baseline():
    return {"user": "alice", "path": "/accounts/alice-backup/profile"}


def near_ai():
    key = os.environ.get("NEAR_AI_API_KEY")
    if not key:
        raise VerificationError("NEAR_AI_API_KEY is required for --near-ai")
    model = os.environ.get("NEAR_AI_MODEL", "z-ai/glm-5.3-flash")
    request = urllib.request.Request(GATEWAY, data=json.dumps({
        "model": model, "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": 1024, "response_format": {"type": "json_object"},
    }).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise VerificationError("NEAR AI response is too large")
        result = json.loads(raw)
        content = result["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ValueError("response content is not text")
        return parse_candidate(content.encode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Do not print the response body, request headers, or URL: provider errors
        # can contain sensitive data. The status is enough to guide the operator.
        raise VerificationError("NEAR AI request failed with HTTP status %d" % exc.code) from None
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, IndexError, TypeError, ValueError, RecursionError) as exc:
        raise VerificationError("NEAR AI request or response failed: " + type(exc).__name__) from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--near-ai", action="store_true", help="call NEAR AI Cloud (may incur charges)")
    args = parser.parse_args()
    try:
        result = near_ai() if args.near_ai else baseline()
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        if args.near_ai:
            print("NEAR AI attestation and response signatures were not verified; synthetic data only.", file=sys.stderr)
    except VerificationError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
