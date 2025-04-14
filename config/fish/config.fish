# Settings
set -g fish_greeting
set -U fish_prompt_pwd_dir_length 0

# Prompt
function fish_prompt
    echo '' (set_color cyan)(prompt_pwd) (set_color green)'* ' 
end

function fish_right_prompt
    echo (set_color red)(fish_git_prompt) ''
end

# Exports
set -x EDITOR nvim
set -x ANSIBLE_CONFIG "/home/jofre/.config/ansible/ansible.cfg"
set -x XDG_CONFIG_HOME "/home/jofre/.config"
set -x CAPACITOR_ANDROID_STUDIO_PATH "/nix/store/blyhb62588lz46flnz855whvmwq3ibng-android-studio-stable-2023.3.1.19/bin/android-studio"
set -x ANDROID_SDK_ROOT "/home/jofre/Android/Sdk"
set -x JAVA_HOME "/usr/lib/jvm/java-17-openjdk-amd64"

set -x PATH $PATH "$HOME/.dotfiles/config/tofi/scripts/"

# Abbreviations
abbr .. cd ..

abbr c clear
abbr e exit
abbr ! sudo !!
abbr to touch
abbr mk mkdir
abbr se sudoedit
abbr sd shutdown now 
abbr rb sudo reboot now 

abbr tr tree
abbr ff fastfetch
abbr b bluetoothctl

abbr gst git status
abbr gad git add .
abbr gco git commit -m
abbr gpu git push

abbr ns nix-shell --run fish
abbr nr sudo nixos-rebuild switch --flake /home/jofre/nix/.#nixos
abbr hr home-manager switch --flake /home/jofre/nix/.#jofre@nixos

# Aliases
alias n="nvim"
alias t="task"

alias ls="exa --icons"
alias grep="grep --color='auto'"

# Keybinds
bind \en "nvim -c ':Oil'"
bind \ef "nvim -c ':Telescope find_files'"
bind \ev "nvim -c ':Telescope live_grep'"
bind \ep "nvim -c ':NeovimProjectDiscover'"
