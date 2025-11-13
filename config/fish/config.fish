# Settings
set -g fish_greeting
set -U fish_prompt_pwd_dir_length 0
set -g fish_history_ignore "exit" "ls" "history" "clear" "ff" "nvim" "nr" "hr"
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
set -x SHELL (which fish)
# Do in nixos config
set -x XDG_CONFIG_HOME "/home/jofre/.config"
set -x PATH $PATH "$HOME/.dotfiles/config/tofi/scripts/"

# Abbreviations
alias n="nvim"
alias ff="fastfetch"
alias b="btop"
alias op="opencode"

alias ..="cd .."

alias sd="shutdown now"
alias rb="sudo reboot now"

alias p="sudo lsof -i -P -n"

alias nd="nix develop"
alias nr="sudo nixos-rebuild switch --flake /home/jofre/.dotfiles/config/nix/.#nixos"
alias hr="home-manager switch --flake /home/jofre/.dotfiles/config/nix/.#jofre@nixos"

alias ls="exa --icons --group-directories-first"
alias lt="exa --tree --level=4 --icons --group-directories-first"
alias grep="grep --color='auto'"

function ateinsa-vpn
    sudo openfortivpn mail.ateinsa.com:10443 --username=jscaricaciottoli --trusted-cert e2f07f1955c5f81a26c7542c6616104c55cf5eaf81147aacccfd7a4aef019737 -p "1234567j\$" $argv
end

# Keybinds
bind -M insert \en "nvim -c Oil"
bind \en "nvim -c Oil"


bind -M insert \cd super-cd
bind \cd super-cd

bind -M insert \cf "bash /home/jofre/.dotfiles/scripts/tmux-sessionizer.sh"
bind \cf "bash /home/jofre/.dotfiles/scripts/tmux-sessionizer.sh"
