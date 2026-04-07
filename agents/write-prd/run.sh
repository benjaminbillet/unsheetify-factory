#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <source-path>" >&2
  exit 1
fi

SOURCE_DIR="$(cd "$1" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_PROMPT="$SCRIPT_DIR/AGENT.md"
PRD_DIR="$REPO_ROOT/prds"

mkdir -p "$PRD_DIR"

before=$(ls "$PRD_DIR" 2>/dev/null || true)

cd "$SOURCE_DIR"
claude \
  --dangerously-skip-permissions \
  --append-system-prompt-file "$AGENT_PROMPT" \
  --add-dir "$REPO_ROOT"

after=$(ls "$PRD_DIR" 2>/dev/null || true)
new_file=$(comm -13 <(echo "$before") <(echo "$after"))

if [[ -z "$new_file" ]]; then
  echo "No PRD file was created during the session." >&2
  exit 1
fi

cat "$PRD_DIR/$new_file"
