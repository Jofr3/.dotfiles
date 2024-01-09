# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# ZSH_THEME="random"

ENABLE_CORRECTION="true"
DISABLE_UNTRACKED_FILES_DIRTY="true"

plugins=( 
    git-prompt
    zsh-autosuggestions 
    zsh-syntax-highlighting
    tmux
)

ZSH_TMUX_AUTOSTART="true"

source $ZSH/oh-my-zsh.sh

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

bindkey '^H' backward-kill-word
bindkey '^ ' autosuggest-accept

PROMPT=" %{$fg[cyan]%}%n%{$reset_color%} %{$fg[magenta]%}~%{$reset_color%}"
PROMPT+=' $(git_prompt_info)'
RPS1="%{$fg[cyan]%}%~%{$reset_color%} "

ZSH_THEME_GIT_PROMPT_PREFIX="%{$fg_bold[blue]%}git:(%{$fg[red]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$reset_color%} "
ZSH_THEME_GIT_PROMPT_DIRTY="%{$fg[blue]%}) %{$fg[yellow]%}%1{✗%}"
ZSH_THEME_GIT_PROMPT_CLEAN="%{$fg[blue]%})"

alias c="clear"
alias e="exit"

# cli utils
alias ls="exa --icons"
alias cat="bat -S --theme gruvbox-dark"
alias k="~/dotfiles/scripts/utils/keybinds.sh"

# programs
alias n="nvim"
alias t="tmux"
alias b="bluetuith"

# dev uitls
alias ports="sudo lsof -i -P -n | grep LISTEN"
alias lzd='sudo docker run --rm -it -v /var/run/docker.sock:/var/run/docker.sock -v /home/jofre/lazydocker/:/.config/jesseduffield/lazydocker lazyteam/lazydocker'
alias cht="cht.sh"
alias tldr="tldr -t ocean"

eval "$(zoxide init zsh)"
fpath=(~/.zsh.d/ $fpath)

