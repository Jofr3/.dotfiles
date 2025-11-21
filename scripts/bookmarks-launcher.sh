#!/usr/bin/env bash

set -euo pipefail

readonly BOOKMARKS_FILE="${HOME}/.dotfiles/scripts/bookmarks.json"
readonly CACHE_FILE="/tmp/bookmarks-launcher-cache.txt"
readonly BROWSER="qutebrowser"

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

build_cache() {
    jq -r '.bookmarks | keys[]' "$BOOKMARKS_FILE"
}

update_cache() {
    if [ ! -f "$CACHE_FILE" ] || [ "$BOOKMARKS_FILE" -nt "$CACHE_FILE" ]; then
        build_cache > "$CACHE_FILE"
    fi
}

has_children() {
    local bookmark="$1"
    local type=$(jq -r --arg bookmark "$bookmark" '.bookmarks[$bookmark] | type' "$BOOKMARKS_FILE")
    [[ "$type" == "object" ]]
}

get_children() {
    local parent="$1"
    jq -r --arg parent "$parent" '.bookmarks[$parent] | keys[]' "$BOOKMARKS_FILE"
}

get_bookmark_url() {
    local parent="$1"
    local child="${2:-}"
    
    if [[ -n "$child" ]]; then
        jq -r --arg parent "$parent" --arg child "$child" \
            '.bookmarks[$parent][$child]' "$BOOKMARKS_FILE"
    else
        jq -r --arg bookmark "$parent" \
            '.bookmarks[$bookmark]' "$BOOKMARKS_FILE"
    fi
}

show_fzf_menu() {
    local input_file="$1"
    local FIFO="/tmp/bookmarks-launcher-$$.fifo"
    mkfifo "$FIFO"
    
    foot --app-id="launcher" bash -c "fzf --reverse --no-scrollbar --padding=1,1,0,2 < $input_file > $FIFO" &
    
    local selected
    selected=$(cat "$FIFO")
    rm "$FIFO"
    
    echo "$selected"
}

launch_browser() {
    local url="$1"
    [[ -n "$url" && "$url" != "null" ]] || error_exit "Invalid URL: $url"
    setsid -f "$BROWSER" "$url" >/dev/null 2>&1
}

main() {
    update_cache
    
    # First selection: show all bookmarks
    local chosen
    chosen=$(show_fzf_menu "$CACHE_FILE")
    [[ -n "$chosen" ]] || exit 0
    
    local url
    
    if has_children "$chosen"; then
        local children_file="/tmp/bookmarks-launcher-children-$$.txt"
        get_children "$chosen" > "$children_file"
        
        local child_chosen
        child_chosen=$(show_fzf_menu "$children_file")
        rm "$children_file"
        
        [[ -n "$child_chosen" ]] || exit 0
        
        url=$(get_bookmark_url "$chosen" "$child_chosen")
    else
        url=$(get_bookmark_url "$chosen")
    fi
    
    launch_browser "$url"
}

main "$@"
