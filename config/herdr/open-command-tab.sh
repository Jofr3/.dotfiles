#!/usr/bin/env bash
set -euo pipefail

# Pass the command as one shell string, e.g. 'nvim' or 'nvim "my file.txt"'.
if (( $# != 1 )) || [[ -z "${1//[[:space:]]/}" ]]; then
  printf 'Usage: %s "command to run in the new tab"\n' "$0" >&2
  exit 2
fi

: "${HERDR_ACTIVE_WORKSPACE_ID:?Run this from a Herdr workspace}"
herdr_bin=${HERDR_BIN_PATH:-herdr}

created_tab=$("$herdr_bin" tab create \
  --workspace "$HERDR_ACTIVE_WORKSPACE_ID" \
  --cwd "${HERDR_ACTIVE_PANE_CWD:-$PWD}" \
  --focus)
pane_id=$(jq -er '.result.root_pane.pane_id' <<< "$created_tab")
"$herdr_bin" pane run "$pane_id" "$1" >/dev/null
