#!/usr/bin/env python3
"""Bounded, data-only subprocess interface for the local application."""
import json
import os
from pathlib import Path
import sys
import generate
import settlement
import verifier


def main():
    command = sys.argv[1] if len(sys.argv) == 2 else ''
    try:
        if command == 'spec':
            spec = settlement.specification()
            result = {'specification': spec, 'sha256': verifier.digest(settlement.canonical(spec))}
        elif command in ('candidate', 'verify'):
            raw = sys.stdin.buffer.read(verifier.MAX_INPUT + 1)
            candidate = verifier.parse_candidate(raw)
            if command == 'verify':
                result = verifier.verify(raw)
            else:
                result = {'candidate': candidate, 'candidate_sha256': verifier.digest(settlement.canonical(candidate))}
        elif command == 'generate':
            result = {'candidate': generate.near_ai(), 'model': os.environ.get('NEAR_AI_MODEL', 'z-ai/glm-5.3-flash'), 'generator_sha256': verifier.digest(Path(generate.__file__).read_bytes()), 'prompt_sha256': verifier.digest(generate.PROMPT.encode()), 'attestation_verified': False, 'response_signature_verified': False}
        else:
            raise verifier.VerificationError('unsupported command')
        print(json.dumps(result, sort_keys=True))
        return 0
    except (verifier.VerificationError, OSError) as exc:
        result = {'error': str(exc)}
        if isinstance(exc, verifier.VerificationError) and exc.details:
            result['execution'] = exc.details
        print(json.dumps(result, sort_keys=True))
        return 2


if __name__ == '__main__':
    sys.exit(main())
