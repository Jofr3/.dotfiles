# Prompt
autoload -Uz vcs_info
precmd() { vcs_info }

zstyle ':vcs_info:*' formats '~ %b'
zstyle ':vcs_info:*' enable git

setopt prompt_subst
PROMPT='%F{green}% %~ %F{cyan}% * %f'
RPROMPT='%F{red}% $vcs_info_msg_0_'

# Settings
autoload -U compinit
compinit -C
setopt completealiases

# Alias

alias c="clear"
alias e="exit"
alias !="sudo !!"

alias ls="exa --icons"
alias grep="grep --color='auto'"
alias nf="fastfetch"

alias n="nvim"
alias b="bluetuith"
alias t="tmux"
alias tr="tree"

alias ports="sudo lsof -i -P -n | grep LISTEN"
alias cht="cht.sh"


# Keybinds
bindkey -s "^[a" 'tmux new-session -A -s main^M'
bindkey -s "^F" 'nvim -c ":Telescope find_files"^M'
bindkey -s "^N" "nvim -c ':lua require(\"oil\").open()'^M"
bindkey -s "^[s" "source ~/.zshrc^M"

# Load ssh keys
eval $(ssh-agent -s) >/dev/null 2>&1
ssh-add ~/.ssh/keys/* >/dev/null 2>&1

# Exports
export EDITOR='nvim'
export BROWSER='google-chrome-stable'

# Evaluations
eval "$(zoxide init bash)"

# Tmux
if [[ -z "$TMUX" ]]; then
    tmux new-session -A -s main
fi
