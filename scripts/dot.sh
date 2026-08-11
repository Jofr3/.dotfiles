#!/usr/bin/env bash

set -euo pipefail

readonly IMAGE="${HOME}/.dotfiles/other/dot.png"

[ -f "$IMAGE" ] || { echo "Error: $IMAGE not found" >&2; exit 1; }

minutes=$(seq 1 60 | fzf --reverse --padding=1,1,0,2) || exit 0
[ -n "$minutes" ] || exit 0

setsid -f bash -c '
    swayimg --fullscreen --appid="dot-timer" "$1" &
    viewer=$!
    sleep $(( $2 * 60 ))
    kill "$viewer" 2>/dev/null || true
' _ "$IMAGE" "$minutes" >/dev/null 2>&1
