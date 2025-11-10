#!/usr/bin/env bash

single_dirs=(
    ~/.config
    ~/.dotfiles
    ~/.dotfiles/scripts
    ~/notes
    ~
)

if [[ $# -eq 1 ]]; then
    selected=$1
else
    selected=$(
        {
            find ~/lsw ~/projects ~/.dotfiles/config -mindepth 1 -maxdepth 1 -type d
            # Add single directories (filter out non-existent ones)
            for dir in "${single_dirs[@]}"; do
                if [[ -d "$dir" ]]; then
                    echo "$dir"
                fi
            done
        } | fzf
    )
fi

if [[ -z $selected ]]; then
    exit 0
fi

selected_name=$(basename "$selected" | tr . _)
tmux_running=$(pgrep tmux)

if [[ -z $TMUX ]] && [[ -z $tmux_running ]]; then
    tmux new-session -s $selected_name -c $selected
    exit 0
fi

if ! tmux has-session -t=$selected_name 2> /dev/null; then
    tmux new-session -ds $selected_name -c $selected
fi

if [[ -z $TMUX ]]; then
    tmux attach -t $selected_name
else
    tmux switch-client -t $selected_name
fi
