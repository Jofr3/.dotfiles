#!/usr/bin/env bash

# App launcher using fzf in foot terminal
# Path to apps configuration
APPS_JSON="/home/jofre/.dotfiles/scripts/apps.json"

selected=$(foot --app-id="app-launcher" sh -c "jq -r 'keys[]' '$APPS_JSON' | fzf --prompt='Launch: ' --reverse --padding=1,1,0,2 ")

if [ -n "$selected" ]; then
  command=$(jq -r --arg app "$selected" '.[$app]' "$APPS_JSON")
  exec "$command"
fi
