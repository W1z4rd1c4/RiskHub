#!/usr/bin/env bash
set -euo pipefail

# Setup local Codex skills outside the repo working tree.
#
# This repo keeps Codex/agent tooling directories (`.codex/`, `.agent/`) local-only
# (ignored by git). This script installs those skills into:
#   $CODEX_HOME/skills (defaults to ~/.codex/skills)
#
# Usage:
#   scripts/setup-dev.sh
#   scripts/setup-dev.sh --dest ~/.codex/skills
#   scripts/setup-dev.sh --force
#
# Notes:
# - Default behavior is non-destructive: if a skill already exists in DEST,
#   it is skipped unless --force is provided.
# - Installs from (if present):
#   - .codex/skills/*/SKILL.md
#   - .agent/skills/*/SKILL.md

dest="${CODEX_HOME:-${HOME}/.codex}/skills"
force=0

while [[ $# -gt 0 ]]; do
  case "${1}" in
    --dest)
      dest="${2:?--dest requires a path}"
      shift 2
      ;;
    --force)
      force=1
      shift
      ;;
    -h|--help)
      sed -n '1,120p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: ${1}" >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${dest}"

install_from_root() {
  local src_root="${1}"
  local label="${2}"

  if [[ ! -d "${src_root}" ]]; then
    echo "skip (${label} not found): ${src_root}"
    return 0
  fi

  local installed=0
  local skipped=0

  for d in "${src_root}"/*; do
    [[ -d "${d}" ]] || continue
    [[ -f "${d}/SKILL.md" ]] || continue

    local name
    name="$(basename "${d}")"
    local target="${dest}/${name}"

    if [[ -e "${target}" && "${force}" -ne 1 ]]; then
      echo "skip (exists): ${name}"
      skipped=$((skipped + 1))
      continue
    fi

    rm -rf "${target}"
    mkdir -p "${target}"

    if command -v rsync >/dev/null 2>&1; then
      rsync -a --exclude ".DS_Store" "${d}/" "${target}/"
    else
      cp -R "${d}/." "${target}/"
      find "${target}" -name ".DS_Store" -delete 2>/dev/null || true
    fi

    echo "installed: ${name}"
    installed=$((installed + 1))
  done

  echo "---"
  echo "Source:    ${label}"
  echo "Installed: ${installed}"
  echo "Skipped:   ${skipped}"
  echo
}

echo "Dest: ${dest}"
echo

install_from_root "${repo_root}/.codex/skills" ".codex/skills"
install_from_root "${repo_root}/.agent/skills" ".agent/skills"

echo "Done. Restart Codex to pick up new skills."

