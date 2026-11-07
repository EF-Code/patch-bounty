#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
source "$repo_dir/scripts/runtime.sh"
for tool in node npm rustup cargo bwrap; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool. See docs/APPLICATION.md." >&2; exit 1; }
done
rustup toolchain install 1.86.0 --profile minimal --target wasm32-unknown-unknown
rustup toolchain install 1.88.0 --profile minimal
npm --prefix contract/integration ci
npm --prefix contract/integration run build:wasm
printf 'Build complete. Start with scripts/start.sh (or --low-fd on a constrained demo host).\n'
