#!/usr/bin/env bash
set -euo pipefail

# Installs this repo's `.agent/skills/*` into the global Codex skills directory.
# Destination defaults to: ~/.codex/skills
#
# Usage:
#   scripts/install_agent_skills_global.sh
#   scripts/install_agent_skills_global.sh --dest ~/.codex/skills
#   scripts/install_agent_skills_global.sh --force

dest="${HOME}/.codex/skills"
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
      sed -n '1,40p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: ${1}" >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src_root="${repo_root}/.agent/skills"

if [[ ! -d "${src_root}" ]]; then
  echo "No skills found at: ${src_root}" >&2
  exit 1
fi

mkdir -p "${dest}"

installed=0
skipped=0

for d in "${src_root}"/*; do
  [[ -d "${d}" ]] || continue
  name="$(basename "${d}")"
  target="${dest}/${name}"

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
    # Fallback copy
    cp -R "${d}/." "${target}/"
    find "${target}" -name ".DS_Store" -delete 2>/dev/null || true
  fi

  echo "installed: ${name}"
  installed=$((installed + 1))
done

echo "---"
echo "Installed: ${installed}"
echo "Skipped:   ${skipped}"
echo "Dest:      ${dest}"
echo "Restart Codex to pick up new skills."

