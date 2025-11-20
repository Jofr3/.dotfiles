#!/usr/bin/env bash

APPS_JSON="/home/jofre/.dotfiles/scripts/apps.json"
CACHE_FILE="/tmp/app-launcher-cache.txt"

if [ ! -f "$CACHE_FILE" ] || [ "$APPS_JSON" -nt "$CACHE_FILE" ]; then
  jq -r 'keys[]' "$APPS_JSON" > "$CACHE_FILE"
fi

FIFO="/tmp/app-launcher-$$.fifo"
mkfifo "$FIFO"

foot --app-id="app-launcher" bash -c "fzf $* --reverse --padding=1,1,0,2 < $CACHE_FILE > $FIFO" &

selected=$(cat "$FIFO")
rm "$FIFO"

if [ -n "$selected" ]; then
  command=$(jq -r --arg app "$selected" '.[$app]' "$APPS_JSON")
  setsid -f /bin/sh -c "$command" >/dev/null 2>&1
fi
