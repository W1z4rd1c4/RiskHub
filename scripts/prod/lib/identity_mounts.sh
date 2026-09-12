#!/usr/bin/env bash

# Mount only files selected by the validated profile; unused operator files stay on the host.
identity_secret_mounts() {
  local backend_env="$1" renderer paths path
  renderer="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../deploy/lib" && pwd)/render.py"
  paths="$(python3 "$renderer" secret-mount-paths --config "$backend_env")" || return 1
  SECRET_MOUNT_ARGS=()
  while IFS= read -r path; do
    if [[ -n "$path" ]]; then
      SECRET_MOUNT_ARGS+=(-v "${path}:${path}:ro")
    fi
  done <<<"$paths"
}
