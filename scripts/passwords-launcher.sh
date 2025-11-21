#!/usr/bin/env bash

set -euo pipefail

readonly PASSWORDS_FILE="${HOME}/.dotfiles/scripts/passwords.json"
readonly CACHE_FILE="/tmp/passwords-launcher-cache.txt"

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

build_cache() {
    jq -r '.items[] | select(.type == 1) | .name' "$PASSWORDS_FILE" | sort -u
}

update_cache() {
    if [ ! -f "$CACHE_FILE" ] || [ "$PASSWORDS_FILE" -nt "$CACHE_FILE" ]; then
        build_cache > "$CACHE_FILE"
    fi
}

get_items_by_name() {
    local name="$1"
    jq --arg name "$name" '[.items[] | select(.type == 1 and .name == $name)]' "$PASSWORDS_FILE"
}

show_fzf_menu() {
    local input_file="$1"
    local FIFO="/tmp/passwords-launcher-$$.fifo"
    mkfifo "$FIFO"
    
    foot --app-id="launcher" bash -c "fzf --reverse --no-scrollbar --padding=1,1,0,2 < $input_file > $FIFO" &
    
    local selected
    selected=$(cat "$FIFO")
    rm "$FIFO"
    
    echo "$selected"
}

send_to_browser() {
    local text="$1"
    wtype "$text" || error_exit "Failed to type text with wtype"
}

get_login_credentials() {
    local selected_name="$1"
    local selected_item="$2"
    
    local username password
    username=$(echo "$selected_item" | jq -r '.login.username // empty')
    password=$(echo "$selected_item" | jq -r '.login.password // empty')
    
    if [[ -z "$username" || -z "$password" ]]; then
        error_exit "Username or password not found for $selected_name"
    fi
    
    send_to_browser "$username"
    wtype -k Tab
    send_to_browser "$password"

    echo "$username" > /tmp/username
    echo "$password" > /tmp/password
}

main() {
    update_cache
    
    local chosen
    chosen=$(show_fzf_menu "$CACHE_FILE")
    [[ -n "$chosen" ]] || exit 0
    
    local items_json
    items_json=$(get_items_by_name "$chosen")
    
    local item_count
    item_count=$(echo "$items_json" | jq 'length')
    
    if [[ "$item_count" -eq 0 ]]; then
        error_exit "No items found for $chosen"
    elif [[ "$item_count" -eq 1 ]]; then
        local selected_item
        selected_item=$(echo "$items_json" | jq '.[0]')
        get_login_credentials "$chosen" "$selected_item"
    else
        local usernames_file="/tmp/passwords-launcher-usernames-$$.txt"
        echo "$items_json" | jq -r '.[] | (.login.username // "no-username")' > "$usernames_file"
        
        local chosen_username
        chosen_username=$(show_fzf_menu "$usernames_file")
        rm "$usernames_file"
        
        [[ -n "$chosen_username" ]] || exit 0
        
        local selected_item
        selected_item=$(echo "$items_json" | jq --arg username "$chosen_username" '
            .[] | select(.login.username == $username)
        ')
        
        if [[ -z "$selected_item" ]]; then
            error_exit "Selected item not found"
        fi
        
        get_login_credentials "$chosen" "$selected_item"
    fi
}

main "$@"
