# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal dotfiles repository using NixOS flakes and Home Manager for declarative system configuration. Multi-machine setup supporting personal (NVIDIA) and work (Intel) hardware with Hyprland desktop environment and Stylix theming.

## Common Commands

```bash
# Rebuild NixOS system (uses hostname to select config)
sudo nixos-rebuild switch --flake /home/jofre/.dotfiles/config/nix/.#$(hostname)

# Apply Home Manager configuration
home-manager switch --flake /home/jofre/.dotfiles/config/nix/.#jofre@nixos

# Update flake inputs
nix flake update /home/jofre/.dotfiles/config/nix/

# Format nix files
nixfmt <file.nix>
```

Fish shell aliases: `nr` (nixos rebuild), `hr` (home-manager rebuild), `nd` (nix develop)

## Repository Structure

```
.dotfiles/
├── config/           # Application configurations (symlinked to ~/.config/)
│   ├── nix/          # NixOS + Home Manager flake (the core)
│   ├── nvim/         # Neovim with lazy.nvim
│   ├── fish/         # Fish shell
│   ├── tmux/         # Terminal multiplexer
│   └── ...           # Other app configs
├── scripts/          # Launcher scripts (apps, bookmarks, passwords, clipboard)
├── wallpapers/       # Desktop wallpapers
└── secrets/          # VPN auth, keys (git-ignored)
```

## Architecture

### NixOS Configuration (`config/nix/`)

**Flake outputs:**
- `nixos` - Personal machine with NVIDIA GPU (`machines/personal/`)
- `nixos-lsw` - Work machine with Intel graphics (`machines/work/`)

**Key directories:**
- `machines/common.nix` - Shared base system config
- `machines/personal/` and `machines/work/` - Hardware-specific modules
- `home/` - Home Manager modules:
  - `default.nix` - Entry point (user prefs, GTK, MIME, FZF theme)
  - `packages.nix` - All user packages
  - `hyprland.nix` - Window manager keybindings
  - `configs.nix` - Symlinks dotfiles to `~/.config/`
  - `ssh.nix` - SSH hosts

### Dotfile Management

Home Manager uses `mkOutOfStoreSymlink` to link configs from this repo to `~/.config/`. Adding a new application config:
1. Create config in `config/<app>/`
2. Add symlink in `home/configs.nix`
3. Run `hr` to apply

### Neovim (`config/nvim/`)

Modular lazy.nvim setup:
- `init.lua` → `lua/config/lazy.lua` (bootstrap)
- `lua/config/` - Core settings, keymaps, options
- `lua/plugins/` - Individual plugin configurations
- Primary tools: snacks.nvim (picker), blink.cmp (completion), rose-pine theme

### Scripts (`scripts/`)

JSON-based launchers triggered via Hyprland keybindings:
- `apps-launcher.sh` + `apps.json`
- `bookmarks-launcher.sh` + `bookmarks.json`
- `passwords-launcher.sh` + `passwords.json` (git-ignored)
- `tmux-sessionizer.sh` (Alt+S in fish/tmux)

### Theming

Stylix provides system-wide base16 theming (rose-pine-moon). Theme config in `config/nix/theme/`. Changes require both NixOS and Home Manager rebuilds.
