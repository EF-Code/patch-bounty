#!/usr/bin/env python3
"""Bounded, data-only subprocess interface for the local application."""
import json
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
            result = generate.near_ai()
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
