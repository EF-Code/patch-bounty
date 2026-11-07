#!/usr/bin/env python3
"""Prepare a reviewable verifier decision for an existing NEAR testnet claim."""
import argparse
import base64
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

import verifier
from generate import NoRedirect

RPC = "https://rpc.testnet.near.org"
ACCOUNT = re.compile(r"[a-z0-9]+(?:[._-][a-z0-9]+)*\Z", re.ASCII)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def valid_testnet_account(account):
    return (isinstance(account, str) and 2 <= len(account) <= 64 and
            ACCOUNT.fullmatch(account) is not None and account.endswith(".testnet"))


def specification():
    return {"challenge": verifier.CHALLENGE,
            "verifier_sha256": verifier.digest(Path(verifier.__file__).read_bytes()),
            "revisions": verifier.REVISIONS}


def fetch_challenge(contract, challenge_id):
    args = base64.b64encode(canonical({"challenge_id": str(challenge_id)})).decode()
    body = canonical({"jsonrpc": "2.0", "id": "patchbounty", "method": "query", "params": {
        "request_type": "call_function", "finality": "final", "account_id": contract,
        "method_name": "get_challenge", "args_base64": args}})
    request = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            raw = response.read(262145)
        if len(raw) > 262144:
            raise ValueError("oversized response")
        result = json.loads(raw)["result"]
        state = json.loads(bytes(result["result"]))
        return state, {"block_hash": result["block_hash"], "block_height": result["block_height"]}
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, TypeError, ValueError, OverflowError) as exc:
        raise verifier.VerificationError("testnet RPC request failed: " + type(exc).__name__) from None


def prepare(contract, challenge_id, raw, evidence_path):
    if not valid_testnet_account(contract):
        raise verifier.VerificationError("contract must be a valid testnet account")
    if challenge_id < 0 or challenge_id > 2**64 - 1:
        raise verifier.VerificationError("challenge ID must be an unsigned 64-bit integer")
    state, block = fetch_challenge(contract, challenge_id)
    spec = specification()
    if not isinstance(state, dict) or state.get("specification_sha256") != verifier.digest(canonical(spec)):
        raise verifier.VerificationError("on-chain specification does not match this verifier and fixture set")
    if state.get("status") != "claimed" or not isinstance(state.get("claim"), dict):
        raise verifier.VerificationError("challenge has no claim awaiting decision")
    claim = state["claim"]
    result = verifier.verify(raw)
    if claim.get("candidate_sha256") != result["candidate_sha256"]:
        raise verifier.VerificationError("on-chain claim does not match the canonical candidate")
    claim_id = claim.get("id")
    if (not isinstance(claim_id, str) or not claim_id.isascii() or not claim_id.isdigit() or
            len(claim_id) > 20 or int(claim_id) > 2**64 - 1 or
            not valid_testnet_account(claim.get("claimant")) or not valid_testnet_account(state.get("verifier"))):
        raise verifier.VerificationError("malformed on-chain claim")
    evidence = {"format": "patchbounty-evidence-v1", "network": "testnet", "contract": contract,
                "challenge_id": str(challenge_id), "chain_block": block, "chain_challenge": state,
                "specification": spec, "verification": result}
    content = json.dumps(evidence, indent=2, sort_keys=True, ensure_ascii=True).encode() + b"\n"
    with evidence_path.open("xb") as file:
        file.write(content)
    args = {"challenge_id": str(challenge_id), "claim_id": claim["id"]}
    if result["decision"] == "eligible":
        method = "approve_claim"
        args.update({"candidate_sha256": result["candidate_sha256"], "evidence_sha256": verifier.digest(content)})
    else:
        method = "reject_claim"
    return {"decision": result["decision"], "verifier": state["verifier"], "claimant": claim["claimant"],
            "evidence_file": str(evidence_path), "evidence_sha256": verifier.digest(content),
            "method": method, "args": args, "contract": contract, "network": "testnet"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("spec", help="print the specification and digest for challenge creation")
    verdict = commands.add_parser("prepare", help="verify a testnet claim and prepare transaction arguments")
    verdict.add_argument("--contract", required=True)
    verdict.add_argument("--challenge", required=True, type=int)
    verdict.add_argument("--candidate", required=True, type=Path)
    verdict.add_argument("--evidence", required=True, type=Path, help="new file; never overwritten")
    args = parser.parse_args()
    try:
        if args.command == "spec":
            spec = specification()
            output = {"specification": spec, "sha256": verifier.digest(canonical(spec))}
        else:
            with args.candidate.open("rb") as file:
                raw = file.read(verifier.MAX_INPUT + 1)
            output = prepare(args.contract, args.challenge, raw, args.evidence)
        print(json.dumps(output, sort_keys=True, indent=2))
        return 0
    except (verifier.VerificationError, OSError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
