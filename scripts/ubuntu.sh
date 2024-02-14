#!/bin/bash

# Creating main directories
mkdir ~/Projects ~/Personal ~/Desktop ~/Downloads ~/.config

# update
sudo apt-get update -y
sudo apt-get upgrade -y

# Install packages
sudo apt install git npm cargo python3-pip kitty neofetch fzf ripgrep fonts-jetbrains-mono tree unzip lsof tmux xclip zoxide network-manager xinit pipewire pipewire-audio default-jdk gradle awesome -y

# Install snap packages
sudo snap install nvim --classic
sudo snap install chromium

# Install nushell
cargo install nu
echo -e "" >> example.txt

# Connect to wifi
nmcli device wifi connect Vera_C326AB password cab6533559

# Install nerd-font
git clone --filter=blob:none --sparse https://github.com/ryanoasis/nerd-fonts.git
cd nerd-fonts
git sparse-checkout add patched-fonts/UbuntuMono
cd ..
sudo mv nerd-fonts/patched-fonts/UbuntuMono/*/*.ttf /usr/share/fonts/
sudo fc-cache -f

# Clone dotfiles
git clone https://github.com/Jofr3/.dotfiles ~/Desktop/.dotfiles

# Link dotfiles
ln -s ~/Desktop/.dotfiles/nvim ~/.config/nvim
ln -s ~/Desktop/.dotfiles/awesome ~/.config/awesome
ln -s ~/Desktop/.dotfiles/nushell ~/.config/nushell
ln -s ~/Desktop/.dotfiles/kitty ~/.config/kitty
ln -s ~/Desktop/.dotfiles/picom ~/.config/picom
ln -s ~/Desktop/.dotfiles/tmux/.tmux.conf ~/.tmux.conf
ls -s ~/Desktop/.dotfiles/xorg/.xinitrc ~/.xinitrc

# Give execute permissions to scripts
sudo chmod +x ~/.xinitrc
sudo chmod +x ~/Desktop/.dotfiles/scripts/utils/*
sudo chmod +x ~/Desktop/.dotfiles/scripts/tools/*

# Install display manager
sudo apt install build-essential libpam0g-dev libxcb-xkb-dev
git clone --recurse-submodules https://github.com/fairyglade/ly
cd ly
make
sudo make install installsystemd
sudo systemctl enable ly
cd ..
sudo rm -r ly
