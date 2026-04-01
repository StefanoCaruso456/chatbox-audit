# Codex Skills

This repo expects a small Codex skill baseline for local development:

- `find-skills`
- `web-design-guidelines`

## Install

Run the bootstrap script from the repo root:

```bash
./scripts/setup-skills.sh
```

The script installs skills into `${CODEX_HOME:-~/.codex}/skills` and safely skips skills that are already present.

## Manual Install

If you prefer to install them yourself, use the Codex skill installer helper:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" --repo vercel-labs/skills --path skills/find-skills
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" --repo vercel-labs/agent-skills --path skills/web-design-guidelines
```

## Notes

- The installer requires network access.
- Restart Codex after installation so the new skills are loaded.
- These skills are local developer tooling and are not vendored into this repository.
