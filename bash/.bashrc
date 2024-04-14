# bashrc

# Prompt
PS1=' \[\e[92m\]\w\[\e[0m\] \[\e[32m\]*\[\e[0m\] '
                        
# General
alias c="clear"
alias e="exit"
alias !="sudo !!"
#
# # Cli utils
alias ls="exa --icons"
alias grep="grep --color='auto'"
alias nf="fastfetch"
#
# # Programs
alias n="nvim"
alias b="bluetuith"
alias t="tmux"
alias tr="tree"
#
# # Dev utils
alias ports="sudo lsof -i -P -n | grep LISTEN"
alias cht="cht.sh"

# Keybinds
bind -x '"\ea": tmux new-session -A -s main '
bind -x '"\C-f": nvim -c ":Telescope find_files"'
bind -x '"\C-g": nvim -c ":Telescope live_grep"'
bind -x '"\C-n": nvim -c ":lua require(\"oil\").open()"'

# Options
bind -s 'set completion-ignore-case on'

# Load ssh keys
eval $(ssh-agent -s) >/dev/null 2>&1
ssh-add ~/.ssh/keys/* >/dev/null 2>&1

# Exports
export EDITOR='nvim'
export ANDROID_SDK_ROOT="/home/jofre/Android/Sdk"
export SRC_ENDPOINT="https://sourcegraph.com"
export SRC_ACCESS_TOKEN="sgp_a0d7ccb4f752ea73_f523428927ec2668d8641e98ec6a22e7238653d4"

# Other
eval "$(zoxide init bash)"

# Launch tmux
if [[ -z "$TMUX" ]]; then
    tmux new-session -A -s main
fi
