# bash_profile

# General
alias c="clear"
alias e="exit"

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

bind -x '"\en": nvim -c ":Telescope find_files"'
bind -x '"\en": nvim -c ":lua require(\"oil\").open()"'
