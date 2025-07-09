#!/bin/bash
set -euo pipefail

readonly PASSWORDS_FILE="${HOME}/.dotfiles/scripts/passwords.json"

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

validate_dependencies() {
    local deps=("jq" "tofi" "wl-copy")
    for dep in "${deps[@]}"; do
        command -v "$dep" >/dev/null 2>&1 || error_exit "Required dependency '$dep' not found"
    done
}

validate_passwords_file() {
    [[ -f "$PASSWORDS_FILE" ]] || error_exit "Passwords file not found: $PASSWORDS_FILE"
    [[ -r "$PASSWORDS_FILE" ]] || error_exit "Cannot read passwords file: $PASSWORDS_FILE"
}

get_selection() {
    local items="$1"
    local selection
    selection=$(echo "$items" | tofi --fuzzy-match=true)
    echo "$selection"
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
    
    echo -n "$username" | wl-copy --primary
    echo -n "$password" | wl-copy
}

get_login_groups() {
    jq -r '.items[] | select(.type == 1) | .name' "$PASSWORDS_FILE" | sort -u
}

get_items_by_name() {
    local name="$1"
    jq --arg name "$name" '[.items[] | select(.type == 1 and .name == $name)]' "$PASSWORDS_FILE"
}

main() {
    validate_dependencies
    validate_passwords_file
    
    local login_groups
    login_groups=$(get_login_groups) || error_exit "Failed to read passwords"
    
    local chosen
    chosen=$(get_selection "$login_groups")
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
        local item_options
        item_options=$(echo "$items_json" | jq -r '.[] | (.login.username // "no-username")')
        
        local chosen_item
        chosen_item=$(get_selection "$item_options")
        [[ -n "$chosen_item" ]] || exit 0
        
        local selected_username
        selected_username=$(echo "$chosen_item" | cut -d' ' -f1)
        
        local selected_item
        selected_item=$(echo "$items_json" | jq --arg username "$selected_username" '
            .[] | select(.login.username == $username)
        ')
        
        if [[ -z "$selected_item" ]]; then
            error_exit "Selected item not found"
        fi
        
        get_login_credentials "$chosen" "$selected_item"
    fi
}

main "$@"
