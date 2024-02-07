#!/bin/bash

# Create basic folders
mkdir ~/Projects ~/Personal ~/Desktop ~/Downloads ~/.ssh ~/.ssh/keys

# Install packages
sudo pacman -S --noconfirm npm chromium docker docker-compose git kitty neofetch fzf ripgrep ttf-jetbrains-mono tree zsh nautilus xf86-input-synaptics neovim alsa-utils sof-firmware brightnessctl ntfs-3g unzip bluez bluez-utils lsof tmux xclip gpick zoxide exa bat lazygit man-db man-pages picom


# Install Aura
git clone https://aur.archlinux.org/aura-bin.git
cd aura-bin
makepkg
sudo pacman -U --noconfirm *.zst
cd ~
sudo rm -r aura-bin

# Install AUR packages
sudo aura -A --noconfirm google-chrome bluetuith

# Install Ohmyzsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Install Ohmyzsh plugins
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

rm ~/.zshrc
rm .bash*

# Cloning dotfiles
git clone git@github.com:Jofr3/.dotfiles.git ~/Desktop/.dotfiles

# Linking dotfiles
ln -s ~/Desktop/.dotfiles/qtile ~/.config/qtile
ln -s ~/Desktop/.dotfiles/nvim ~/.config/nvim
ln -s ~/Desktop/.dotfiles/kitty ~/.config/kitty
ln -s ~/Desktop/.dotfiles/tmux/.tmux.conf ~/.tmux.conf
ln -s ~/Desktop/.dotfiles/picom ~/.config/picom
ln -s ~/Desktop/.dotfiles/zshrc/.zshrc ~/.zshrc
ln -s ~/Desktop/.dotfiles/zshrc/.zshenv ~/.zshenv    
ls -s ~/Desktop/.dotfiles/xorg/.xinitrc ~/.xinitrc

sudo chmod +x ~/.xinitrc

# Fix audio bug
ln -s ~/Desktop/.dotfiles/other/default.pa /etc/pulse/default.pa

# Fix trackpad light touch
sudo ln -s ~/Desktop/.dotfiles/xorg/70-synaptics.conf /etc/X11/xorg.conf.d/70-synaptics.conf

# Install nerd font icons
mkdir icons
cd icons
curl -LO https://github.com/ryanoasis/nerd-fonts/releases/download/v3.0.2/NerdFontsSymbolsOnly.zip
unzip NerdFontsSymbolsOnly.zip
mkdir ~/.local/share/fonts/
mv SymbolsNerdFontMono-Regular.ttf ~/.local/share/fonts/
mv SymbolsNerdFont-Regular.ttf ~/.local/share/fonts/
sudo fc-cache -fv
cd ..
rm -r icons

# Give execute permissions to scripts
sudo chmod +x ~/Desktop/.dotfiles/scripts/utils/*
sudo chmod +x ~/Desktop/.dotfiles/scripts/tools/*

sudo systemctl enable bluetooth.service
