#!/bin/bash

# Create basic folders
mkdir ~/Projects ~/Personal ~/Desktop ~/Downloads ~/.ssh

# Install packages
sudo pacman -S --noconfirm npm chromium docker docker-compose git kitty neofetch ripgrep ttf-jetbrains-mono tree neovim alsa-utils sof-firmware brightnessctl ntfs-3g unzip bluez bluez-utils lsof tmux xclip gpick zoxide man-db man-pages picom bluez ly

# Cloning dotfiles
git clone git@github.com:Jofr3/.dotfiles.git ~/Desktop/.dotfiles

# Linking dotfiles
ln -s ~/Desktop/.dotfiles/awesome ~/.config/awesome
ln -s ~/Desktop/.dotfiles/nvim ~/.config/nvim
ln -s ~/Desktop/.dotfiles/kitty ~/.config/kitty
ln -s ~/Desktop/.dotfiles/picom ~/.config/picom
ln -s ~/Desktop/.dotfiles/tmux/.tmux.conf ~/.tmux.conf
ls -s ~/Desktop/.dotfiles/xorg/.xinitrc ~/.xinitrc

# Fix audio bug
ln -s ~/Desktop/.dotfiles/other/default.pa /etc/pulse/default.pa

# Fix trackpad light touch
sudo ln -s ~/Desktop/.dotfiles/xorg/70-synaptics.conf /etc/X11/xorg.conf.d/70-synaptics.conf

# Give execute permissions to scripts
sudo chmod +x ~/.xinitrc
sudo chmod +x ~/Desktop/.dotfiles/scripts/utils/*
sudo chmod +x ~/Desktop/.dotfiles/scripts/tools/*

sudo systemctl enable bluetooth.service
sudo systemctl enable ly.service

