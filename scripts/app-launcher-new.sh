#!/bin/bash

set -euo pipefail

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

validate_dependencies() {
    local deps=("foot" "fzf")
    for dep in "${deps[@]}"; do
        command -v "$dep" >/dev/null 2>&1 || error_exit "Required dependency '$dep' not found"
    done
}

get_screen_dimensions() {
    local screen_info
    screen_info=$(xrandr --current | grep -oP 'current \K\d+ x \d+' | tr -d ' ')
    SCREEN_WIDTH=$(echo "$screen_info" | cut -d'x' -f1)
    SCREEN_HEIGHT=$(echo "$screen_info" | cut -d'x' -f2)
}

calculate_window_geometry() {
    # Window size: 60% of screen width and height
    local width=$((SCREEN_WIDTH * 60 / 100))
    local height=$((SCREEN_HEIGHT * 60 / 100))
    
    # Center position
    local x=$(((SCREEN_WIDTH - width) / 2))
    local y=$(((SCREEN_HEIGHT - height) / 2))
    
    echo "${width}x${height}+${x}+${y}"
}

main() {
    validate_dependencies
    get_screen_dimensions
    
    local geometry
    geometry=$(calculate_window_geometry)
    
    # Launch floating foot terminal with fzf
    # Using --app-id for window identification in compositor rules
    exec foot \
        --app-id="fzf-launcher" \
        --window-size-chars="${geometry}" \
        sh -c 'fzf || true'
}

main "$@"
