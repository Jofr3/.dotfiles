# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Niri scrollable tiling Wayland compositor configuration, part of a NixOS dotfiles setup. NixOS enables niri and Home Manager generates its configuration from `wayland.windowManager.niri.settings` in `config/nix/modules/desktop/niri.nix` (see `config/nix/AGENTS.md` for the layout).

## Configuration

Edit `config/nix/modules/desktop/niri.nix`. The `config.kdl` in this directory is a legacy snapshot retained for existing generations until they are rebuilt.

After editing, rebuild with `sudo nixos-rebuild switch --flake .#<host>` from `config/nix`. Home Manager installs the generated config at `~/.config/niri/config.kdl`; niri hot-reloads it. Home Manager manages the entire directory to safely replace the previous out-of-store directory symlink.

The generated config is validated during its build. To validate the installed config: `niri validate`.

## Key Design Decisions

- **Theme**: Rose Pine Moon colors — accent `#c4a7e7`, inactive `#6e6a86`, urgent `#eb6f92`
- **Keyboard layout**: US + Canadian, Caps Lock remapped to Control (`ctrl:nocaps`)
- **Mod key (Super) bindings**: Vim-style HJKL navigation (H/L for columns, J/K for workspaces)
- **No borders/shadows/gaps**: Minimal chrome, focus ring width 0
- **Launchers**: Super+O (apps), Super+U (bookmarks), Super+X (commands) — all invoke scripts from `~/.dotfiles/scripts/`
- **Terminal**: foot server/client model (systemd user service in `terminals.nix`, `footclient` on Super+Return)
- **Dual monitor**: HDMI-A-1 (top) + eDP-1 (bottom) at 1080p
