"""Synthetic revision 2: route checks were added, but the prefix bug remains."""
import json
import sys

request = json.load(sys.stdin)
parts = request["path"].split("/")
allowed = (len(parts) == 4 and parts[1] == "accounts" and
           parts[2].startswith(request["user"]) and parts[3] == "profile")
print(json.dumps({"allowed": allowed}, sort_keys=True))
