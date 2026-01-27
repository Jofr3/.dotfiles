# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

NixOS and Home Manager flake configuration for a multi-machine setup with Hyprland desktop environment and Stylix theming.

## Common Commands

```bash
# Rebuild NixOS system (personal machine with NVIDIA)
sudo nixos-rebuild switch --flake .#nixos

# Rebuild NixOS system (work machine with Intel graphics)
sudo nixos-rebuild switch --flake .#nixos-lsw

# Apply home-manager configuration
home-manager switch --flake .#jofre@nixos

# Update flake inputs
nix flake update

# Format nix files
nixfmt-classic <file.nix>
```

## Architecture

### Flake Structure

Two NixOS configurations differentiated by hardware:
- `nixos` - Personal machine with NVIDIA GPU (`nixos/personal/`)
- `nixos-lsw` - Work machine with Intel integrated graphics (`nixos/work/`)

Both share `nixos/configuration.nix` as the common base.

### Home Manager

Single user configuration `jofre@nixos` that imports modular configs from `home/shared/`:
- `packages.nix` - User packages (CLI tools, editors, browsers, dev tools, LSPs)
- `hyprland.nix` - Window manager configuration with keybindings
- `configs.nix` - Symlinks to dotfiles at `~/.dotfiles/config/`
- `stylix.nix` - Theme configuration (currently rose-pine-moon)
- `bash.nix`, `ssh.nix` - Shell and SSH settings

### External Dependencies

Configuration symlinks to `~/.dotfiles/config/` for: git, nvim, fish, tmux, kitty, foot, zellij, wezterm, tofi, btop, helix, zed, qutebrowser, opencode, and claude.

### Theming

Stylix provides system-wide theming via base16 color schemes. Theme files in `theme/` directory. Both NixOS and Home Manager import Stylix modules and must stay in sync.
