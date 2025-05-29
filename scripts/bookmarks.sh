#!/bin/bash

bookmarks_file="/home/jofre/.dotfiles/scripts/bookmarks.json"

bookmarks=$(jq -r '.bookmarks | keys[]' $bookmarks_file)
chosen=$(echo "$bookmarks" | tofi --fuzzy-match=true)
has_children=$(jq --arg chosen "$chosen" '.bookmarks.[$chosen] | type == "object" or type == "array"' $bookmarks_file)

if [ -z "$chosen" ]; then
  exit 0
fi

if [ $has_children == "false" ]; then
  goto=$(jq -r --arg chosen "$chosen" '.bookmarks.[$chosen]' $bookmarks_file)
else
  children=$(jq -r --arg chosen "$chosen" '.bookmarks.[$chosen] | keys[]' $bookmarks_file)
  child_chosen=$(echo "$children" | tofi --fuzzy-match=true)
  goto=$(jq -r --arg chosen "$chosen" --arg child_chosen "$child_chosen" '.bookmarks.[$chosen].[$child_chosen]' $bookmarks_file)

  if [ -z "$child_chosen" ]; then
    exit 0
  fi
fi

vivaldi $goto
exit 0

