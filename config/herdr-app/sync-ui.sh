#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SRC="mods/my-files/ui.js"
TARGETS=(cmd-buttons my-spaces my-agents my-chrome my-tabs my-changes remote services)
for m in "${TARGETS[@]}"; do
  cp "$SRC" "mods/$m/ui.js"
done
UNIQUE=$(md5sum "$SRC" mods/{cmd-buttons,my-spaces,my-agents,my-chrome,my-tabs,my-changes,remote,services}/ui.js | awk '{print $1}' | sort -u | wc -l)
if [ "$UNIQUE" -ne 1 ]; then
  echo "ERROR: ui.js copies diverged!" >&2
  exit 1
fi
echo "OK: all 9 ui.js copies are byte-identical."
