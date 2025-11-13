# Agent Guidelines for NixOS Dotfiles

## Build/Test Commands (run from `/home/jofre/.dotfiles/config/nix`)
- **Rebuild system**: `sudo nixos-rebuild switch --flake .#nixos`
- **Rebuild home-manager**: `home-manager switch --flake .#jofre@nixos`
- **Test without switching**: `sudo nixos-rebuild test --flake .#nixos`
- **Validate flake**: `nix flake check` (validates syntax and evaluates all configs)
- **Format file**: `nixfmt-classic <file>` (2-space indentation)

## Code Style
- **Module pattern**: `{ inputs, lib, pkgs, ... }: { imports = [ ./module.nix ]; }` with explicit parameters
- **Indentation**: 2 spaces, no tabs, no trailing whitespace
- **Package lists**: Use `with pkgs;` for lists only (e.g., `home.packages = with pkgs; [ vim git ];`)
- **Explicit elsewhere**: Use `pkgs.` prefix outside package lists for clarity (e.g., `shell = pkgs.fish;`)
- **Path references**: Relative paths (`../theme/wallpaper.jpg`); absolute only in `mkOutOfStoreSymlink`
- **Let bindings**: Extract reusable values (e.g., `let dotfiles = config.lib.file.mkOutOfStoreSymlink "/home/jofre/.dotfiles"; in`)
- **Comments**: Use `#` sparingly; group packages with section comments (`# cli`, `# apps`, `# lsp's`, `# formatters`)

## Naming & Structure
- **Files**: kebab-case (`hardware-configuration.nix`, `shared/stylix.nix`)
- **Attributes**: camelCase (`homeDirectory`, `allowUnfree`, `stateVersion`)
- **Organization**: `nixos/` (system), `home/jofre.nix` (user), `home/shared/` (shared), `theme/` (styling)

## Critical Rules
- **Never change `stateVersion = "25.05"`** after initial setup
- Use `mkOutOfStoreSymlink` for frequently-edited configs (see `home/shared/configs.nix`)
- Use `inputs.nixpkgs.follows = "nixpkgs"` to avoid version conflicts in flake inputs
- Enable `experimental-features = "nix-command flakes"` in nix settings
