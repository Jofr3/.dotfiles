# Path to your oh-my-zsh installation.
# syndaemon -i 0.5 -t -K -d &
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

export JAVA_HOME='/usr/lib/jvm/java-17-openjdk-amd64'
export ANDROID_SDK_ROOT='/home/jofre/Android/Sdk'
export CAPACITOR_ANDROID_STUDIO_PATH='/snap/bin/android-studio'

alias c="clear"
alias e="exit"

# cli utils
alias ls="exa --icons"
alias k="cat ~/Desktop/.dotfiles/other/keys | fzf"

# programs
alias n="nvim"
alias t="tmux"
alias b="bluetuith"
alias tr="tree"

# dev uitls
alias ports="sudo lsof -i -P -n | grep LISTEN"
# alias lzd='sudo docker run --rm -it -v /var/run/docker.sock:/var/run/docker.sock -v /home/jofre/lazydocker/:/.config/jesseduffield/lazydocker lazyteam/lazydocker'
alias cht="cht.sh"
alias tldr="tldr -t ocean"

# system
alias bup="sudo brightnessctl set +5%"
alias bdown="sudo brightnessctl set 5%-"

eval "$(zoxide init zsh)"
fpath=(~/.zsh.d/ $fpath)


# Created by `pipx` on 2024-01-18 09:43:39
export PATH="$PATH:/home/jofre/.local/bin"
