# Shared environment defaults. Preserve user choices, inherited proxy settings and TLS validation.
if [[ -d "$HOME/.cargo/bin" ]]; then export PATH="$HOME/.cargo/bin:$PATH"; fi
if [[ -z ${PATCHBOUNTY_PYTHON:-} ]]; then
  if [[ -x "$HOME/.venv/bin/python" ]]; then export PATCHBOUNTY_PYTHON="$HOME/.venv/bin/python"; else export PATCHBOUNTY_PYTHON=python3; fi
fi
if [[ -n ${HTTPS_PROXY:-}${HTTP_PROXY:-}${https_proxy:-}${http_proxy:-} ]]; then
  export NODE_USE_ENV_PROXY="${NODE_USE_ENV_PROXY:-1}"
  if [[ -z ${NODE_EXTRA_CA_CERTS:-} && -r /etc/ssl/certs/ca-certificates.crt ]]; then
    export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
  fi
fi
