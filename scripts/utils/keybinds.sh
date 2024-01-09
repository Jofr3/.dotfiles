#!/bin/bash

options=`echo "tmux neovim" | tr ' ' '\n'`
selected=`printf "$options" | fzf -i`

keybinds=(
    "Tmux:M-a:Enter-modal-mode"
    "Tmux:Esc:Exit-modal-mode"
    "Tmux:v:Split-window-horizontally"
    "Tmux:x:Split-window-vertically"
    "Tmux:c:Kill-pane"
    "Tmux:M-h:Select-left-pane"
    "Tmux:M-j:Select-pane-down"
    "Tmux:M-k:Select-pane-up"
    "Tmux:M-l:Select-right-pane"
    "Tmux:H:Resize-pane-left"
    "Tmux:J:Resize-pane-down"
    "Tmux:K:Resize-pane-up"
    "Tmux:L:Resize-pane-right"
    "Tmux:C-h:Swap-pane-left"
    "Tmux:C-l:Swap-pane-right"
    "Tmux:n:New-window"
    "Tmux:0..9:Go-to-0..9-window"
    "Tmux:d:Rename-window"
    "Tmux:C:Kill-window"
    "Tmux:M-c:Kill-session"
    "Tmux:D:Rename-session"
    "Tmux:f:Browse-sessions"
    "Neovim:A-s:Harpoon-list"
    "Neovim:A-v:Mark-file-harpoon"
    "Neovim:A-0..9:Go-to-file-0..9-harpoon"
    "Neovim:A-i:Go-to-next-file-harpoon"
    "Neovim:A-o:Go-to-previouse-file-harpoon"
    "Neovim:Space-l-d:Go-to-declaration-(LSP)"
    "Neovim:Space-l-f:Go-to-definition-(LSP)"
    "Neovim:Space-l-h:Show-documentation-on-hover-(LSP)"
    "Neovim:Space-l-i:Go-to-implementation-(LSP)"
    "Neovim:Space-l-s:Show-signature-help-(LSP)"
    "Neovim:Space-l-t:Go-to-type-definitions-(LSP)"
    "Neovim:Space-l-r:Rename-(LSP)"
    "Neovim:Space-l-a:Code-action-(LSP)"
    "Neovim:Space-l-e:List-refrences-(LSP)"
    "Neovim:A-a:Format-buffer-(LSP)"
    "Neovim:A-:"
)

fildered=""
for i in ${keybinds[@]}
do
    if printf $i | grep -qis $selected; then
        IFS=':' read -r -a array <<< "$i"
        IFS='-' read -r -a array2 <<< "${array[2]}"
        fildered+="${array[1]} ➜ ${array2[@]}+"
        selected="${array[0]}"
    fi
done

fildered=`echo $fildered | tr '+' '\n'`
selectedKey=`printf "$fildered" | fzf -i` 

NC="\033[0m"
GREEN="\033[0;32m"
LRED="\033[1;31m"
LCYAN="\033[1;36m"
ORANGE="\033[0;33m"

IFS='➜' read -r -a array <<< "$selectedKey"
printf "${GREEN}${selected}${NC} ${ORANGE}➜${NC} ${LRED}${array[0]}${NC}${ORANGE}➜${NC}${LCYAN}${array[1]}\n"
