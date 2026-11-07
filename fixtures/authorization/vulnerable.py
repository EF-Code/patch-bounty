"""Synthetic revision 1: an unsafe path-prefix authorization check."""
import json
import sys

request = json.load(sys.stdin)
allowed = request["path"].startswith("/accounts/" + request["user"])
print(json.dumps({"allowed": allowed}, sort_keys=True))
