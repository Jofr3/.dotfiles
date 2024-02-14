#!/bin/bash

# Create basic folders
mkdir ~/Projects ~/Personal ~/Desktop ~/Downloads ~/.ssh ~/.config

# Update system
sudo pacamn -Syu --noconfirm

# Install packages
sudo pacman -S --noconfirm npm chromium docker docker-compose git kitty neofetch ripgrep ttf-jetbrains-mono tree neovim alsa-utils sof-firmware brightnessctl ntfs-3g unzip bluez bluez-utils lsof tmux xclip gpick zoxide man-db man-pages picom bluez ly networkmanager

# Install yay
sudo pacman -S --needed git base-devel && git clone https://aur.archlinux.org/yay-bin.git && cd yay-bin && makepkg -si

# Connect to wifi
nmcli device wifi connect Vera_C326AB password cab6533559

# Clone ssh keys
git clone https://github.com/Jofr3/keys.git ~/.ssh/keys

# Load ssk keys
chmod 600 ~/.ssh/keys/* 
eval $(ssh-agent -s) 
ssh-add ~/.ssh/keys/* 

# Cloning dotfiles
git clone git@github.com:Jofr3/.dotfiles.git ~/Desktop/.dotfiles

# Linking dotfiles
ln -s ~/Desktop/.dotfiles/awesome ~/.config/awesome
ln -s ~/Desktop/.dotfiles/nvim ~/.config/nvim
ln -s ~/Desktop/.dotfiles/kitty ~/.config/kitty
ln -s ~/Desktop/.dotfiles/picom ~/.config/picom
ln -s ~/Desktop/.dotfiles/tmux/.tmux.conf ~/.tmux.conf
ls -s ~/Desktop/.dotfiles/xorg/.xinitrc ~/.xinitrc

# Clone other stuff
git clone git@github.com:Jofr3/wiki.git ~/Personal/wiki
git clone git@github.com:Jofr3/notes.git ~/Personal/notes

# Fix trackpad light touch
sudo ln -s ~/Desktop/.dotfiles/xorg/70-synaptics.conf /etc/X11/xorg.conf.d/70-synaptics.conf

# Give execute permissions to scripts
sudo chmod +x ~/.xinitrc
sudo chmod +x ~/Desktop/.dotfiles/scripts/utils/*
sudo chmod +x ~/Desktop/.dotfiles/scripts/tools/*

# Enable services
sudo systemctl enable bluetooth.service
sudo systemctl enable ly.service
