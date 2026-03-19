# Settings
set -g fish_greeting
set -U fish_prompt_pwd_dir_length 0
set -g fish_history_ignore "exit" "ls" "history" "clear" "ff" "nvim" "nr" "hr" "cc" "hr" "nr" "cd"
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
set -Ux FZF_DEFAULT_OPTS "
	--color=fg:#908caa,bg:#232136,hl:#ea9a97
	--color=fg+:#e0def4,bg+:#393552,hl+:#ea9a97
	--color=border:#44415a,header:#3e8fb0,gutter:#232136
	--color=spinner:#f6c177,info:#9ccfd8
	--color=pointer:#c4a7e7,marker:#eb6f92,prompt:#908caa"
# set -Ux CLAUDE_CODE_DISABLE_AUTO_MEMORY=0

# Abbreviations
alias n="nvim"
alias ff="fastfetch"
alias b="btop"
alias op="opencode"
alias bcc="bunx @anthropic-ai/claude-code"
alias bcx="bunx @openai/codex@latest"
alias bpi="bunx @mariozechner/pi-coding-agent"
alias bgi="bunx @google/gemini-cli"
alias cc="claude"

alias ..="cd .."

alias sd="shutdown now"
alias rb="sudo reboot now"

alias p="sudo lsof -i -P -n"

alias nd="nix develop"
alias nr="sudo nixos-rebuild switch --flake /home/jofre/.dotfiles/config/nix/."
alias hr="home-manager switch --flake /home/jofre/.dotfiles/config/nix/.#jofre@nixos"

alias ls="exa --icons --group-directories-first"
alias lt="exa --tree --level=4 --icons --group-directories-first"
alias grep="grep --color='auto'"

alias secrets="cd ~/.dotfiles/config/nix && SOPS_AGE_KEY=(ssh-to-age -private-key -i ~/.ssh/sops) sops secrets/secrets.yaml && cd -"

alias vpn-ateinsa="sudo openfortivpn mail.ateinsa.com:10443 --username=jscaricaciottoli --trusted-cert 99d778754041593273a81f14ba1241a5ec9c665891f1ec9517bc07e1a571d4f9 -p '1234567j\$'"

# Keybinds
bind \ef super-cd
bind \es "~/.dotfiles/scripts/tmux-sessionizer.sh"
