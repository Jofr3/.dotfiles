#!/usr/bin/env bash

set -euo pipefail

screenshots_dir="${HOME}/Documents/screenshots"
mkdir -p "$screenshots_dir"

geometry="$(slurp)" || exit 0
[[ -n "$geometry" ]] || exit 0

grim -g "$geometry" -t ppm - | satty \
    --filename - \
    --fullscreen \
    --output-filename "${screenshots_dir}/$(date +%Y%m%d-%H%M%S).png" \
    --copy-command wl-copy \
    --actions-on-enter save-to-clipboard,save-to-file,exit \
    --actions-on-escape exit
