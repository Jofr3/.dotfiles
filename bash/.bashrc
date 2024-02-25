# bashrc

# Prompt
PS1=' \[\e[92m\]\w\[\e[0m\] \[\e[32m\]*\[\e[96m\] \[\e[0m\]'
                        
# General
alias c="clear"
alias e="exit"
alias !="sudo !!"

# Cli utils
alias ls="exa --icons"

# Programs
alias n="nvim"
alias b="bluetuith"
alias tr="tree"

# Dev utils
alias ports="sudo lsof -i -P -n | grep LISTEN"
alias cht="cht.sh"
alias tldr="tldr -t ocean"

# Keybinds
bind -x '"\ea": tmux new-session -A -s main '
bind -x '"\C-f": nvim -c ":Telescope find_files"'
bind -x '"\C-n": nvim -c ":lua require(\"oil\").open()"'

# Options
bind -s 'set completion-ignore-case on'

# Load ssh keys
eval $(ssh-agent -s) >/dev/null 2>&1
ssh-add ~/.ssh/keys/* >/dev/null 2>&1

# Other
eval "$(zoxide init bash)"

# Launch tmux
if [[ -z "$TMUX" ]]; then
    tmux new-session -A -s main
fi
