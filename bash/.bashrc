# bashrc

# ssh
eval $(ssh-agent -s) >/dev/null 2>&1
ssh-add ~/.ssh/keys/* >/dev/null 2>&1

# Prompt
PS1='\[\e[94m\]\w\[\e[0m\]  \n\[\e[92m\]~\[\e[96m\] \[\e[0m\]'
                        
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
bind -x '"\ea": zellij attach --create main'
bind -x '"\C-f": nvim -c ":Telescope find_files"'
bind -x '"\C-n": nvim -c ":lua require(\"oil\").open()"'

# Options
bind -s 'set completion-ignore-case on'

# Other
eval "$(zoxide init bash)"

# if [[ -z "$ZELLIJ" ]]; then
#     zellij attach --create main
# fi
