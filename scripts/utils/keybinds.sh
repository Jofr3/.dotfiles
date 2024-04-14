#!/bin/bash

options=`echo "tmux neovim" | tr ' ' '\n'`
selected=`printf "$options" | fzf -i`

keybinds=(
    "Tmux:M-a:Enter-modal-mode"
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
