#!/usr/bin/env python3
"""Render a standalone reviewer page from local or settlement evidence."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import sys


def esc(value):
    return html.escape(str(value), quote=True)


def render(raw):
    if len(raw) > 2_000_000:
        raise ValueError("evidence file is too large")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("unsupported evidence format")
    if data.get("format") == "patchbounty-evidence-v1":
        result = data["verification"]
        chain = data["chain_challenge"]
        chain_section = """<section class="card"><h2>Chain snapshot</h2><p>Network: {network} · Contract: <code>{contract}</code> · Challenge: {challenge}</p>
<p>Claimant: <code>{claimant}</code> · Verifier: <code>{verifier}</code></p>
<p>Recorded state at block {block}: <strong>{status}</strong>. Check the chain for current settlement status.</p></section>""".format(
            network=esc(data["network"]), contract=esc(data["contract"]), challenge=esc(data["challenge_id"]),
            claimant=esc(chain["claim"]["claimant"]), verifier=esc(chain["verifier"]),
            block=esc(data["chain_block"]["block_height"]), status=esc(chain["status"]))
    elif data.get("challenge") == "synthetic-account-prefix-v1" and data.get("decision") in ("eligible", "not_eligible"):
        result = data
        chain_section = '<section class="card"><h2>Settlement</h2><p>Local verification only; no chain state is included.</p></section>'
    else:
        raise ValueError("unsupported evidence format")
    revisions = result["revisions"]
    rows = "".join(
        "<tr><th>" + esc(name) + "</th><td>" + esc(revisions[name]["allowed"]) +
        "</td><td><code>" + esc(revisions[name]["sha256"]) + "</code></td></tr>"
        for name in ("vulnerable", "incomplete", "corrected"))
    raw_display = esc(json.dumps(data, indent=2, sort_keys=True))
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PatchBounty evidence review</title><style>
:root{{color-scheme:light;font-family:system-ui,sans-serif;color:#202938;background:#f2f5f8}}
body{{max-width:1000px;margin:3rem auto;padding:0 1.25rem;line-height:1.5}}
header,.card{{background:white;border:1px solid #dbe2ea;border-radius:12px;padding:1.5rem;margin-bottom:1rem}}
h1{{margin:0 0 .3rem}}h2{{font-size:1.1rem}}p{{margin:.5rem 0}}code,pre{{font-family:ui-monospace,monospace;overflow-wrap:anywhere}}
pre{{white-space:pre-wrap;background:#f6f8fa;padding:1rem;border-radius:6px}}table{{width:100%;border-collapse:collapse;text-align:left}}
td,th{{padding:.6rem;border-bottom:1px solid #e5eaf0;vertical-align:top}}.notice{{color:#715500}}.decision{{font-size:1.4rem;font-weight:700}}
@media(max-width:650px){{table,tbody,tr,td,th{{display:block}}td,th{{padding:.25rem 0;border:0}}tr{{border-bottom:1px solid #ddd;padding:.75rem 0}}}}
</style></head><body><header><p>PATCHBOUNTY / EVIDENCE REVIEW</p><h1>Authorization challenge</h1>
<p class="decision">Decision: {decision}</p><p class="notice">Saved evidence, not a live settlement view. The result is a trusted verifier assertion; it is not an execution attestation.</p></header>
<section class="card"><h2>Candidate</h2><pre>{candidate}</pre><p>Canonical SHA-256: <code>{candidate_hash}</code></p></section>
<section class="card"><h2>Revision outcomes</h2><table><tr><th>Revision</th><th>Allowed</th><th>Fixture SHA-256</th></tr>{rows}</table>
<p>Verifier SHA-256: <code>{verifier_hash}</code></p></section>
{chain_section}
<section class="card"><h2>Evidence</h2><p>File SHA-256: <code>{file_hash}</code></p><details><summary>Inspect complete evidence JSON</summary><pre>{raw}</pre></details></section>
</body></html>""".format(decision=esc(result["decision"]), candidate=esc(json.dumps(result["candidate"], indent=2)),
                         candidate_hash=esc(result["candidate_sha256"]), rows=rows,
                         verifier_hash=esc(result["verifier_sha256"]), chain_section=chain_section,
                         file_hash=hashlib.sha256(raw).hexdigest(), raw=raw_display)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("output", type=Path, help="new HTML file; never overwritten")
    args = parser.parse_args()
    try:
        with args.evidence.open("rb") as file:
            raw = file.read(2_000_001)
        page = render(raw)
        with args.output.open("x", encoding="utf-8") as file:
            file.write(page)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("Unable to render evidence: " + str(exc), file=sys.stderr)
        return 2
    print("Wrote " + str(args.output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
