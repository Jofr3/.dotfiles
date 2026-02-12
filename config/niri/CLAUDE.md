# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Niri scrollable tiling Wayland compositor configuration, part of a NixOS dotfiles setup. The config is symlinked to `~/.config/niri/` via Home Manager (`home/configs.nix`). Niri is enabled as a NixOS program in `machines/common.nix`.

## Configuration

Single file: `config.kdl` using [KDL](https://kdl.dev/) format.

After editing, reload niri in-place — no rebuild needed since it's an out-of-store symlink. Niri watches and hot-reloads the config automatically.

To validate syntax: `niri validate`

## Key Design Decisions

- **Theme**: Rose Pine Moon colors — accent `#c4a7e7`, inactive `#6e6a86`, urgent `#eb6f92`
- **Keyboard layout**: US + Canadian multilingual, Caps Lock remapped to Escape
- **Mod key (Super) bindings**: Vim-style HJKL navigation (H/L for columns, J/K for workspaces)
- **No borders/shadows/gaps**: Minimal chrome, focus ring width 0
- **Launchers**: Mod+O (apps), Mod+P (passwords), Mod+X (commands), Mod+C (clipboard) — all invoke scripts from `~/.dotfiles/scripts/`
- **Terminal**: foot server/client model (`foot --server` at startup, `footclient` on Mod+Return)
- **Dual monitor**: HDMI-A-1 (top) + eDP-1 (bottom) at 1080p
