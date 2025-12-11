#!/usr/bin/env bash

# Read JSON input from stdin
input=$(cat)

# Extract data from JSON
cwd=$(echo "$input" | jq -r '.workspace.current_dir // ""')
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')

# Change to the working directory
if [ -n "$cwd" ] && [ -d "$cwd" ]; then
    cd "$cwd" 2>/dev/null || true
fi

# Get current directory name
dir_name=$(basename "$(pwd)")

# Get git branch (skip optional locks for performance)
branch=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    branch=$(git -c core.fileMode=false branch --show-current 2>/dev/null || echo "")
fi

# Build status line
status=""

# Add directory
status="${status}${dir_name}"

# Add git branch if available
if [ -n "$branch" ]; then
    status="${status} (${branch})"
fi

# Add model
status="${status} - ${model}"

echo "$status"
