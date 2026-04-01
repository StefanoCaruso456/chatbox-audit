#!/usr/bin/env bash

set -euo pipefail

CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
INSTALLER="$CODEX_HOME_DIR/skills/.system/skill-installer/scripts/install-skill-from-github.py"
SKILLS_DIR="$CODEX_HOME_DIR/skills"

if [[ ! -f "$INSTALLER" ]]; then
  echo "Codex skill installer not found at $INSTALLER" >&2
  echo "Make sure Codex is installed before running this script." >&2
  exit 1
fi

mkdir -p "$SKILLS_DIR"

install_skill() {
  local name="$1"
  local repo="$2"
  local path="$3"

  if [[ -d "$SKILLS_DIR/$name" ]]; then
    echo "Skill already installed: $name"
    return
  fi

  python3 "$INSTALLER" --repo "$repo" --path "$path"
}

install_skill "find-skills" "vercel-labs/skills" "skills/find-skills"
install_skill "web-design-guidelines" "vercel-labs/agent-skills" "skills/web-design-guidelines"

echo "Installed required Codex skills."
echo "Restart Codex to pick up new skills."
