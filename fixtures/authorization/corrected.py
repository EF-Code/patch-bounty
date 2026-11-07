"""Synthetic revision 3: the account component must match exactly."""
import json
import sys

request = json.load(sys.stdin)
parts = request["path"].split("/")
allowed = (len(parts) == 4 and parts[1] == "accounts" and
           parts[2] == request["user"] and parts[3] == "profile")
print(json.dumps({"allowed": allowed}, sort_keys=True))
