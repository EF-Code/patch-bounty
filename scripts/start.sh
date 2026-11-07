#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
source "$repo_dir/scripts/runtime.sh"
if ! command -v node >/dev/null || [[ ! -d contract/integration/node_modules ]]; then
  echo 'Install Node.js and run scripts/setup.sh first.' >&2; exit 1
fi
if [[ ! -f contract/target/wasm32-unknown-unknown/release/patchbounty_escrow_near.wasm ]]; then
  echo 'Build the contract with scripts/setup.sh first.' >&2; exit 1
fi
low_fd=false
app_args=()
for arg in "$@"; do
  case "$arg" in
    --low-fd) low_fd=true ;;
    --testnet-spending-authorized) app_args+=("$arg") ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done
if [[ -z ${PATCHBOUNTY_TESTNET_CONFIG:-} ]]; then
  runtime_dir=$(mktemp -d /tmp/patchbounty-local-node-XXXXXX)
  trap 'rm -rf -- "$runtime_dir"' EXIT
  unset PATCHBOUNTY_NODE_LIMITS_LIBRARY
  fd_limit=$(ulimit -Hn)
  if [[ "$fd_limit" != unlimited && "$fd_limit" -lt 65535 ]]; then
    if [[ "$low_fd" != true ]]; then
      echo "The local NEAR node requests 65535 open files; this host allows $fd_limit. Use a compatible host, or explicitly run scripts/start.sh --low-fd for this small synthetic demo." >&2; exit 1
    fi
    command -v gcc >/dev/null || { echo 'The optional low-fd mode requires gcc.' >&2; exit 1; }
    gcc -shared -fPIC -O2 -Wall -o "$runtime_dir/limits.so" scripts/local-node-limits.c -ldl
    export PATCHBOUNTY_NODE_LIMITS_LIBRARY="$runtime_dir/limits.so"
    echo "Low-fd demo mode: only the local NEAR node will use the host's $fd_limit descriptor ceiling." >&2
  else
    ulimit -Sn 65535
  fi
  cat > "$runtime_dir/near-sandbox" <<'WRAPPER'
#!/usr/bin/env bash
if [[ -n ${PATCHBOUNTY_NODE_LIMITS_LIBRARY:-} ]]; then export LD_PRELOAD="$PATCHBOUNTY_NODE_LIMITS_LIBRARY"; fi
args=("$@")
for index in "${!args[@]}"; do
  case "${args[$index]}" in 0.0.0.0:*) args[$index]="127.0.0.1:${args[$index]#0.0.0.0:}" ;; esac
done
exec "$PATCHBOUNTY_NODE_BINARY" "${args[@]}"
WRAPPER
  chmod +x "$runtime_dir/near-sandbox"
  export PATCHBOUNTY_NODE_BINARY="$repo_dir/contract/integration/node_modules/near-sandbox/bin/near-sandbox"
  export NEAR_SANDBOX_BIN_PATH=1 NEAR_SANDBOX_BINARY_PATH="$runtime_dir"
fi
node contract/integration/app-server.mjs "${app_args[@]}"
