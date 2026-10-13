#!/bin/sh
# Re-copy the official Seedance 2.5 skill into the app so the system prompt stays current.
set -e
SRC="${1:-$HOME/.claude/skills/sd25-pe/SKILL.md}"
DEST="$(dirname "$0")/../src/skill/sd25-pe.md"
cp "$SRC" "$DEST"
echo "Copied $SRC -> $DEST"
