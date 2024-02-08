#!/bin/bash

# Creating main directories
mkdir ~/Projects ~/Personal ~/Desktop ~/Downloads ~/.ssh ~/.ssh/keys ~/.config

# update
sudo apt-get update
sudo apt-get upgrade

# Install packages
sudo apt install git npm python3-pip zsh kitty neofetch fzf ripgrep fonts-jetbrains-mono tree nautilus unzip lsof tmux xclip gpick zoxide exa network-manager xinit -y

# Install snap packages
sudo snap install nvim chromium docker --classic

# Connect to wifi
nmcli device wifi connect Vera_C326AB password cab6533559

# Install google-chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt -f install
sudo rm -r google-chrome-stable_current_amd64.deb

# Install ohmyzsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Install Ohmyzsh plugins
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

rm ~/.zshrc
rm .bash*

# Clone dotfiles
git clone https://github.com/Jofr3/.dotfiles ~/Desktop/.dotfiles

# Link dotfiles
ln -s ~/Desktop/.dotfiles/qtile ~/.config/qtile
ln -s ~/Desktop/.dotfiles/nvim ~/.config/nvim
ln -s ~/Desktop/.dotfiles/kitty ~/.config/kitty
ln -s ~/Desktop/.dotfiles/tmux/.tmux.conf ~/.tmux.conf
ln -s ~/Desktop/.dotfiles/picom ~/.config/picom
ln -s ~/Desktop/.dotfiles/zshrc/.zshrc ~/.zshrc
ln -s ~/Desktop/.dotfiles/zshrc/.zshenv ~/.zshenv    
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
make install installsystemd
sudo systemctl enable ly
cd ..
sudo rm -r ly

# Install qtile
pip install qtile --break-system-packages

# Restart system
sudo reboot now
