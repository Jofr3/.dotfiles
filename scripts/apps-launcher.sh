#!/usr/bin/env bash

APPS_JSON="${HOME}/.dotfiles/scripts/apps.json"
CACHE_FILE="/tmp/app-launcher-cache.txt"

if [ ! -f "$CACHE_FILE" ] || [ "$APPS_JSON" -nt "$CACHE_FILE" ]; then
  jq -r 'keys[]' "$APPS_JSON" > "$CACHE_FILE"
fi

FIFO="/tmp/app-launcher-$$.fifo"
mkfifo "$FIFO"

foot --app-id="launcher" bash -c "fzf --reverse --no-scrollbar --padding=1,1,0,2 < $CACHE_FILE > $FIFO" &

selected=$(cat "$FIFO")
rm "$FIFO"

if [ -n "$selected" ]; then
  entry=$(jq -c --arg app "$selected" '.[$app]' "$APPS_JSON")

  if echo "$entry" | jq -e 'type == "object"' >/dev/null 2>&1; then
    command=$(echo "$entry" | jq -r '.command')
    workspace=$(echo "$entry" | jq -r '.workspace // empty')
  else
    command=$(echo "$entry" | jq -r '.')
    workspace=""
  fi

  if [ -n "$workspace" ]; then
    niri msg action focus-workspace "$workspace"
  fi

  setsid -f /bin/sh -c "$command" >/dev/null 2>&1
fi
