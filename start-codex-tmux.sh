#!/usr/bin/env bash
set -euo pipefail

SESSION="weatherman"
START_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHELL_BIN="${SHELL:-/bin/sh}"
SHELL_CMD="$(printf '%q' "$SHELL_BIN")"

command -v tmux >/dev/null 2>&1 || {
  echo "tmux is not installed or not on PATH" >&2
  exit 1
}

command -v codex >/dev/null 2>&1 || {
  echo "codex is not installed or not on PATH" >&2
  exit 1
}

if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach-session -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -n CDX -c "$START_DIR" "codex; exec $SHELL_CMD -l"
tmux new-window -t "$SESSION" -n TRML -c "$START_DIR"

exec tmux attach-session -t "$SESSION"
