#!/usr/bin/env fish

set selected (
  begin
    find ~/Projects ~/.config ~/.dotfiles/config/  -mindepth 1 -maxdepth 1 -type d
    find ~/nix ~/.dotfiles ~/Dropbox/notes -mindepth 0 -maxdepth 0 -type d
  end | fzf
)

if test -z "$selected"
  exit 0
end

set selected_name (basename "$selected" | tr . _)

zellij attach $selected_name -c
