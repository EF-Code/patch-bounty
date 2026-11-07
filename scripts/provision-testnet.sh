#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source "$repo_dir/scripts/runtime.sh"
node "$repo_dir/contract/integration/provision-testnet.mjs" --testnet-spending-authorized
