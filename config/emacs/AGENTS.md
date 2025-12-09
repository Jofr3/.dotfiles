# Emacs Configuration Guidelines

## Overview
Emacs configuration using use-package for declarative plugin management. Part of NixOS dotfiles.

## Commands
- **Reload config**: `M-x eval-buffer` in init.el or restart Emacs
- **Install packages**: Automatic via use-package on startup, or `M-x package-install`
- **Check health**: `M-x list-packages` to view installed packages

## Code Style
- **File headers**: Use `;;; filename.el --- Description -*- lexical-binding: t -*-` format (see init.el:1)
- **Indentation**: 2 spaces, match Emacs Lisp conventions
- **Comments**: Use `;;` for inline, `;;;` for section headers, `;;;;` for top-level
- **Setq**: Group related settings with `setq` or `setq-default` (init.el:48-51)
- **Use-package**: Declare packages with `:init`, `:config`, `:hook`, `:bind` keywords (init.el:98-173)
- **Mode hooks**: Use `dolist` for multiple modes (init.el:20-24)

## Configuration Structure
- **early-init.el**: Performance optimizations, runs before package initialization
- **init.el**: Main configuration, UI settings, package declarations
- **Execution order**: early-init.el → init.el → packages load
- **Backups**: Auto-saved to `backups/` directory (init.el:41-45)

## Adding Packages
Use `use-package` format: `(use-package pkg-name :ensure t :config ...)` - auto-installs from MELPA/ELPA
