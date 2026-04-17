#!/usr/bin/env bash
set -euo pipefail

dir="$HOME/.config/kitty/sessions"
sel=$(find "$dir" -maxdepth 1 -type f -name '*.session' -printf '%f\n' \
    | sed 's/\.session$//' \
    | fzf --prompt='session> ' --height=100% --layout=reverse)

[ -n "$sel" ] || exit 0

kitten @ action goto_session "$dir/$sel.session"
