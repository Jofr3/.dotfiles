#!/bin/bash

set -euo pipefail

readonly BOOKMARKS_FILE="${HOME}/.dotfiles/scripts/bookmarks.json"
readonly BROWSER="qutebrowser"

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

validate_dependencies() {
    local deps=("jq" "walker" "$BROWSER")
    for dep in "${deps[@]}"; do
        command -v "$dep" >/dev/null 2>&1 || error_exit "Required dependency '$dep' not found"
    done
}

validate_bookmarks_file() {
    [[ -f "$BOOKMARKS_FILE" ]] || error_exit "Bookmarks file not found: $BOOKMARKS_FILE"
    [[ -r "$BOOKMARKS_FILE" ]] || error_exit "Cannot read bookmarks file: $BOOKMARKS_FILE"
}

get_selection() {
    local items="$1"
    local selection
    selection=$(echo "$items" | walker --dmenu)
    echo "$selection"
}

has_children() {
    local bookmark="$1"
    jq --exit-status --arg bookmark "$bookmark" \
        '.bookmarks[$bookmark] | type == "object" or type == "array"' \
        "$BOOKMARKS_FILE" >/dev/null 2>&1
}

get_bookmark_url() {
    local bookmark="$1"
    local child="${2:-}"
    
    if [[ -n "$child" ]]; then
        jq -r --arg bookmark "$bookmark" --arg child "$child" \
            '.bookmarks[$bookmark][$child]' "$BOOKMARKS_FILE"
    else
        jq -r --arg bookmark "$bookmark" \
            '.bookmarks[$bookmark]' "$BOOKMARKS_FILE"
    fi
}

get_bookmark_list() {
    local parent="${1:-}"
    
    if [[ -n "$parent" ]]; then
        jq -r --arg parent "$parent" \
            '.bookmarks[$parent] | keys[]' "$BOOKMARKS_FILE"
    else
        jq -r '.bookmarks | keys[]' "$BOOKMARKS_FILE"
    fi
}

launch_browser() {
    local url="$1"
    [[ -n "$url" && "$url" != "null" ]] || error_exit "Invalid URL: $url"
    exec "$BROWSER" "$url"
}

main() {
    validate_dependencies
    validate_bookmarks_file
    
    local bookmarks
    bookmarks=$(get_bookmark_list) || error_exit "Failed to read bookmarks"
    
    local chosen
    chosen=$(get_selection "$bookmarks")
    [[ -n "$chosen" ]] || exit 0
    
    local url
    
    if has_children "$chosen"; then
        local children
        children=$(get_bookmark_list "$chosen") || error_exit "Failed to read bookmark children"
        
        local child_chosen
        child_chosen=$(get_selection "$children")
        [[ -n "$child_chosen" ]] || exit 0
        
        url=$(get_bookmark_url "$chosen" "$child_chosen")
    else
        url=$(get_bookmark_url "$chosen")
    fi
    
    launch_browser "$url"
}

main "$@"
