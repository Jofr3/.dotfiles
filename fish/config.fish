# Settings
set -g fish_greeting
set -U fish_prompt_pwd_dir_length 0

# Prompt
function fish_prompt
    echo '' (set_color green)(prompt_pwd) (set_color cyan)'* ' 
end

function fish_right_prompt
    echo (set_color red)(fish_git_prompt) ''
end

# Abbreviations
abbr .. cd ..

abbr c clear
abbr e exit
abbr ! sudo !!

abbr n nvim
abbr t tmux
abbr tr tree
abbr ff fastfetch
abbr b bluetoothctl

abbr gst git status
abbr gad git add .
abbr gcm git commit -m
abbr gbr git branch
abbr gch git checkout
abbr grf git reflog

abbr nr sudo nixor-rebuild switch

# Aliases
alias ls="exa --icons"
alias grep="grep --color='auto'"

# Keybinds
bind \cs "source ~/.config/fish/config.fish"
bind \ea "tmux new-session -A -s main"
bind \cn "nvim -c ':lua require(\"oil\").open()'"
bind \cf "nvim -c ':Telescope find_files'"
