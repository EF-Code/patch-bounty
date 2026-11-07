#!/usr/bin/env python3
"""Verify one fixed, synthetic authorization challenge; never execute submitted code."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
CHALLENGE = "synthetic-account-prefix-v1"
REVISIONS = {
    "vulnerable": "1d160ab18e7930a28fa36915eab7fefcf63245d1bd2a1156e2a50c009ffbc102",
    "incomplete": "c4086ab9f05cc3859fce88f974893641e799adbdd3467099c3ad87e1b54822a9",
    "corrected": "9ef89552a3a3bba5ac9dae0138541485703a61cefbaca7227c997d8b559e8816",
}
NAME = r"[a-z][a-z0-9-]{0,31}"
USER = re.compile(NAME + r"\Z", re.ASCII)
PATH = re.compile(r"/accounts/(" + NAME + r")/profile\Z", re.ASCII)
MAX_INPUT = 4096
MAX_OUTPUT = 4096


class VerificationError(Exception):
    def __init__(self, message, details=None):
        super().__init__(message)
        self.details = details or {}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def parse_candidate(raw):
    if len(raw) > MAX_INPUT:
        raise VerificationError("candidate exceeds 4096 bytes")
    try:
        candidate = json.loads(raw, object_pairs_hook=unique_object)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise VerificationError("candidate must be valid JSON with unique keys") from None
    if not isinstance(candidate, dict) or set(candidate) != {"user", "path"}:
        raise VerificationError("candidate must contain exactly user and path")
    if not isinstance(candidate["user"], str) or not USER.fullmatch(candidate["user"]):
        raise VerificationError("user must be a lowercase account name")
    if not isinstance(candidate["path"], str) or not PATH.fullmatch(candidate["path"]):
        raise VerificationError("path must be /accounts/<account>/profile")
    return candidate


def limits():
    resource.setrlimit(resource.RLIMIT_CPU, (1, 1))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT, MAX_OUTPUT))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def run_revision(bwrap, runtime, python_relative, fixture, candidate_bytes):
    # All host paths are fixed by this verifier, not supplied by the candidate.
    command = [bwrap, "--unshare-all", "--new-session", "--die-with-parent",
               "--clearenv", "--setenv", "HOME", "/tmp",
               "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib",
               "--ro-bind", "/lib64", "/lib64", "--ro-bind", str(runtime), "/runtime",
               "--ro-bind", str(fixture), "/fixture.py", "--proc", "/proc",
               "--dev", "/dev", "--tmpfs", "/tmp", "--chdir", "/tmp",
               "/runtime/" + python_relative, "-I", "-S", "/fixture.py"]
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        try:
            process = subprocess.run(command, input=candidate_bytes, stdout=stdout, stderr=stderr,
                                     env={"PATH": "/usr/bin:/bin"}, timeout=3,
                                     preexec_fn=limits, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            stdout.seek(0)
            stderr.seek(0)
            raise VerificationError("sandbox failed or timed out: " + type(exc).__name__, {
                "outcome": type(exc).__name__, "stdout": stdout.read(MAX_OUTPUT).decode("utf-8", errors="replace"),
                "stderr": stderr.read(MAX_OUTPUT).decode("utf-8", errors="replace"),
            }) from None
        stdout.seek(0)
        stderr.seek(0)
        out, err = stdout.read(MAX_OUTPUT + 1), stderr.read(MAX_OUTPUT + 1)
    if process.returncode != 0 or len(out) > MAX_OUTPUT or len(err) > MAX_OUTPUT:
        raise VerificationError("sandbox or fixture failed (exit %s)" % process.returncode, {
            "exit_code": process.returncode, "stdout": out.decode("utf-8", errors="replace"),
            "stderr": err.decode("utf-8", errors="replace"),
        })
    try:
        result = json.loads(out, object_pairs_hook=unique_object)
    except (ValueError, UnicodeDecodeError):
        raise VerificationError("fixture produced invalid output", {"exit_code": process.returncode,
                                "stdout": out.decode("utf-8", errors="replace"),
                                "stderr": err.decode("utf-8", errors="replace")}) from None
    if not isinstance(result, dict) or set(result) != {"allowed"} or type(result["allowed"]) is not bool:
        raise VerificationError("fixture produced unexpected output", {"exit_code": process.returncode,
                                "stdout": out.decode("utf-8", errors="replace"),
                                "stderr": err.decode("utf-8", errors="replace")})
    return {"exit_code": process.returncode, "stdout": out.decode("utf-8"),
            "stderr": err.decode("utf-8", errors="replace"), "allowed": result["allowed"]}


def verify(raw):
    candidate = parse_candidate(raw)
    bwrap = shutil.which("bwrap")
    if not bwrap or sys.platform != "linux":
        raise VerificationError("Linux and bubblewrap (bwrap) are required; no host fallback is provided")
    runtime = Path(sys.base_prefix).resolve()
    executable = Path(sys.executable).resolve()
    try:
        python_relative = str(executable.relative_to(runtime))
    except ValueError:
        raise VerificationError("Python executable must be inside its base prefix") from None
    canonical = json.dumps(candidate, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    results = {}
    with tempfile.TemporaryDirectory(prefix="patchbounty-") as directory:
        for name, expected in REVISIONS.items():
            source = ROOT / "fixtures" / "authorization" / (name + ".py")
            try:
                data = source.read_bytes()
            except OSError:
                raise VerificationError("cannot read pinned fixture: " + name,
                                        {"failed_revision": name, "completed_revisions": results}) from None
            if digest(data) != expected:
                raise VerificationError("fixture digest mismatch: " + name,
                                        {"failed_revision": name, "expected_sha256": expected,
                                         "actual_sha256": digest(data), "completed_revisions": results})
            # Execute the bytes just hashed, avoiding a check/use race on the fixture path.
            copy = Path(directory) / (name + ".py")
            copy.write_bytes(data)
            try:
                result = run_revision(bwrap, runtime, python_relative, copy, canonical)
            except VerificationError as exc:
                exc.details.update({"failed_revision": name, "fixture_sha256": expected,
                                    "completed_revisions": results})
                raise
            result["sha256"] = expected
            results[name] = result
    target = PATH.fullmatch(candidate["path"]).group(1)
    eligible = (target != candidate["user"] and results["vulnerable"]["allowed"] and
                results["incomplete"]["allowed"] and not results["corrected"]["allowed"])
    return {"challenge": CHALLENGE, "candidate": candidate,
            "candidate_sha256": digest(canonical), "candidate_input_sha256": digest(raw),
            "verifier_sha256": digest(Path(__file__).read_bytes()),
            "python_version": sys.version, "python_executable_sha256": digest(executable.read_bytes()),
            "sandbox": "bubblewrap namespaces; CPU, memory, file-size and wall-time limits",
            "revisions": results, "decision": "eligible" if eligible else "not_eligible"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path, help="path to a bounded JSON candidate")
    args = parser.parse_args()
    raw = None
    try:
        with args.candidate.open("rb") as file:
            raw = file.read(MAX_INPUT + 1)
        result = verify(raw)
    except (VerificationError, OSError) as exc:
        failure = {"challenge": CHALLENGE, "decision": "error", "error": str(exc),
                   "verifier_sha256": digest(Path(__file__).read_bytes()), "pinned_revisions": REVISIONS}
        if raw is not None:
            key = "candidate_input_prefix_sha256" if len(raw) > MAX_INPUT else "candidate_input_sha256"
            failure[key] = digest(raw)
        if isinstance(exc, VerificationError) and exc.details:
            failure["execution"] = exc.details
        print(json.dumps(failure, sort_keys=True))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
