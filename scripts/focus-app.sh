#!/bin/bash
# Focus a window by app_id, or launch it if not running.
# Cycles through windows when already focused on one.
# Prioritizes current workspace otherwise.
# Usage: focus-app.sh <app_id> [launch_command...]

APP_ID="$1"
shift

FOCUSED=$(niri msg -j focused-window)
FOCUSED_ID=$(echo "$FOCUSED" | jq -r '.id // empty')
FOCUSED_APP=$(echo "$FOCUSED" | jq -r '.app_id // empty')
CURRENT_WS=$(echo "$FOCUSED" | jq -r '.workspace_id')

# Get all matching window IDs, current workspace first
WINDOW_IDS=$(niri msg -j windows | jq -r \
  --arg app "$APP_ID" --argjson ws "$CURRENT_WS" \
  '[.[] | select(.app_id == $app)] | sort_by(if .workspace_id == $ws then 0 else 1 end) | .[].id')

if [ -z "$WINDOW_IDS" ]; then
    [ $# -gt 0 ] && exec "$@"
    exit 0
fi

# If focused on this app, pick the next window in the cycle
if [ "$FOCUSED_APP" = "$APP_ID" ]; then
    PICK_NEXT=false
    for ID in $WINDOW_IDS; do
        if $PICK_NEXT; then
            niri msg action focus-window --id "$ID"
            exit 0
        fi
        [ "$ID" = "$FOCUSED_ID" ] && PICK_NEXT=true
    done
    # Wrap around to first
    niri msg action focus-window --id "$(echo "$WINDOW_IDS" | head -1)"
else
    niri msg action focus-window --id "$(echo "$WINDOW_IDS" | head -1)"
fi
