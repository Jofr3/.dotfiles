# Settings
set -g fish_greeting
set -U fish_prompt_pwd_dir_length 0
set -g fish_history_ignore "exit" "ls" "history" "clear" "ff" "nvim"
set -g fish_autosuggestion_enabled 0
set -g fish_key_bindings fish_vi_key_bindings

# Prompt
function fish_prompt
    echo '' (set_color cyan)(prompt_pwd) (set_color green)'* ' 
end

function fish_mode_prompt
end

# Exports
set -x EDITOR nvim
# Do in nixos config
set -x XDG_CONFIG_HOME "/home/jofre/.config"
set -x PATH $PATH "$HOME/.dotfiles/config/tofi/scripts/"

# Abbreviations
alias n="nvim"
alias ff="fastfetch"
alias b="btop"

alias ..="cd .."

alias sd="shutdown now"
alias rb="sudo reboot now"

alias p="sudo lsof -i -P -n"

alias gst="git status"
alias gad="git add ."
alias gco="git commit -m"
alias gpu="git push"

alias ns="nix-shell"
alias nd="nix develop"
alias nr="sudo nixos-rebuild switch --flake /home/jofre/nix/.#nixos"
alias hr="home-manager switch --flake /home/jofre/nix/.#jofre@nixos"

alias ls="exa --icons --group-directories-first"
alias lt="exa --tree --level=4 --icons --group-directories-first"
alias grep="grep --color='auto'"

# Keybinds
bind \ee "nvim"
bind \ef super-cd
