# Settings
set -g fish_greeting
set -U fish_prompt_pwd_dir_length 0
set -g fish_history_ignore "exit" "ls" "history" "clear" "ff" "nvim" "nr" "hr" "op"
set -g fish_autosuggestion_enabled 0

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
set -Ux FZF_DEFAULT_OPTS "
	--color=fg:#908caa,bg:#232136,hl:#ea9a97
	--color=fg+:#e0def4,bg+:#393552,hl+:#ea9a97
	--color=border:#44415a,header:#3e8fb0,gutter:#232136
	--color=spinner:#f6c177,info:#9ccfd8
	--color=pointer:#c4a7e7,marker:#eb6f92,prompt:#908caa"

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
alias nr="sudo nixos-rebuild switch --flake /home/jofre/.dotfiles/config/nix/.#$(hostname)"
alias hr="home-manager switch --flake /home/jofre/.dotfiles/config/nix/.#jofre@nixos"

alias ls="exa --icons --group-directories-first"
alias lt="exa --tree --level=4 --icons --group-directories-first"
alias grep="grep --color='auto'"

# Keybinds
bind \eo super-cd
bind \es "~/.dotfiles/scripts/tmux-sessionizer.sh"

alias claude="/home/jofre/.claude/local/claude"
