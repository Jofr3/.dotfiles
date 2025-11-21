#!/usr/bin/env bash

set -euo pipefail

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

main() {
    local FIFO="/tmp/clipboard-launcher-$$.fifo"
    mkfifo "$FIFO"
    
    foot --app-id="launcher" bash -c "cliphist list | fzf --no-sort --no-scrollbar --reverse --padding=1,1,0,2 > $FIFO" &
    
    local selected
    selected=$(cat "$FIFO")
    rm "$FIFO"
    
    [[ -n "$selected" ]] || exit 0
    
    echo "$selected" | cliphist decode | wl-copy
}

main "$@"
