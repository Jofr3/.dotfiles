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
set -x ANDROID_SDK_ROOT "/home/jofre/Android/Sdk"

set -x PATH $PATH "$HOME/.dotfiles/config/tofi/scripts/"

# Abbreviations
abbr .. cd ..

abbr c clear
abbr e exit
abbr ! sudo !!
abbr to touch
abbr se sudoedit
abbr sd shutdown now 
abbr rb sudo reboot now 

abbr tr tree
abbr ff fastfetch
abbr b btop
abbr p sudo lsof -i -P -n

abbr gst git status
abbr gad git add .
abbr gco git commit -m
abbr gpu git push

abbr ns nix-shell --run fish
abbr nr sudo nixos-rebuild switch --flake /home/jofre/nix/.#nixos
abbr hr home-manager switch --flake /home/jofre/nix/.#jofre@nixos

function fzf-cd
    set -l directories (
        fd --type d --max-depth 1 --min-depth 1 . ~/lsw/
        printf "%s\n" \
            "~/.dotfiles" \
            "~/.dotfiles/scripts"
        fd --type d --max-depth 1 --min-depth 1 . ~/.dotfiles/config/
        printf "%s\n" \
            "~/Dropbox/notes" \
            "~/Downloads" \
            "~/Documents" \
            "~/.ssh" \
            "~/nix" 
    )

    set -l display_directories
    for dir in $directories
        set -a display_directories (string replace -- "$HOME" "~" "$dir")
    end

    set -l selected_dir (printf "%s\n" $display_directories | sk)

    if test -n "$selected_dir"
      cd (string replace '~' "$HOME" "$selected_dir")
      commandline -f repaint
    end
end

# Aliases
alias n="nvim"

alias ls="exa --icons --group-directories-first"
alias grep="grep --color='auto'"

# Keybinds
bind \ee "nvim"
bind \ef fzf-cd
