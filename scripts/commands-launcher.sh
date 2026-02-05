#!/usr/bin/env bash

set -euo pipefail

readonly COMMANDS_FILE="${HOME}/.dotfiles/scripts/commands.json"
readonly CACHE_FILE="/tmp/commands-launcher-cache.txt"

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

build_cache() {
    jq -r '.commands | keys[]' "$COMMANDS_FILE"
}

update_cache() {
    if [ ! -f "$CACHE_FILE" ] || [ "$COMMANDS_FILE" -nt "$CACHE_FILE" ]; then
        build_cache > "$CACHE_FILE"
    fi
}

show_fzf_menu() {
    local FIFO="/tmp/commands-launcher-$$.fifo"
    mkfifo "$FIFO"
    
    foot --app-id="launcher" bash -c "fzf --reverse --padding=1,1,0,2 < $CACHE_FILE > $FIFO" &
    
    local selected
    selected=$(cat "$FIFO")
    rm "$FIFO"
    
    echo "$selected"
}

get_command_info() {
    local name="$1"
    jq -r --arg name "$name" '.commands[$name]' "$COMMANDS_FILE"
}

run_command() {
    local name="$1"
    local info=$(get_command_info "$name")

    local command=$(echo "$info" | jq -r '.command')
    local terminal=$(echo "$info" | jq -r '.terminal // false')
    local hold=$(echo "$info" | jq -r '.hold // false')
    local app_id=$(echo "$info" | jq -r '."app-id" // empty')
    [[ -z "$app_id" ]] && app_id="launcher"

    if [[ "$terminal" == "true" ]]; then
        if [[ "$hold" == "true" ]]; then
            foot --app-id="$app_id" bash -c 'eval "$1"; echo -e "\n\nPress any key to close..."; read -n 1' _ "$command" &
        else
            foot --app-id="$app_id" bash -c 'eval "$1"' _ "$command" &
        fi
    else
        setsid -f bash -c "$command" >/dev/null 2>&1
    fi
}

main() {
    update_cache
    
    local chosen
    chosen=$(show_fzf_menu)
    [[ -n "$chosen" ]] || exit 0
    
    run_command "$chosen"
}

main "$@"
