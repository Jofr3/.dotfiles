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
set -x ANSIBLE_CONFIG /home/jofre/.config/ansible/ansible.cfg
set -x XDG_CONFIG_HOME /home/jofre/.config

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
abbr gbr git branch
abbr gdi git diff 
abbr gdif git diff --
abbr gsh git show
abbr gch git checkout
abbr gre git reset
abbr gre! git reset --hard
abbr gchf git checkout --
abbr glo git log
abbr grf git reflog

abbr ap ansible-playbook 

abbr ns nix-shell --run fish
abbr nrw sudo nixor-rebuild switch

# Aliases
alias n="nvim"
alias t="task"

alias ls="exa --icons"
alias grep="grep --color='auto'"

# Keybinds
bind \cs "source ~/.config/fish/config.fish"
bind \cn "nvim -c ':lua require(\"oil\").open()'"
bind \cf "nvim -c ':Telescope find_files'"
