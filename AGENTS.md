# Agent Guidelines for NixOS Dotfiles

## Build/Test Commands
- **Rebuild NixOS system**: `sudo nixos-rebuild switch --flake .#nixos` (from `/home/jofre/.dotfiles/config/nix`)
- **Rebuild home-manager**: `home-manager switch --flake .#jofre@nixos` (from `/home/jofre/.dotfiles/config/nix`)
- **Check flake**: `nix flake check` (validates flake syntax and evaluates configs)
- **Format single file**: `nixfmt-classic <file>` (formats with 2-space indentation)
- **Test config without switching**: `sudo nixos-rebuild test --flake .#nixos`

## Code Style
- **Imports**: Use pattern `{ inputs, lib, pkgs, ... }: { imports = [ ./module.nix ]; }` with explicit parameters
- **Indentation**: Use 2 spaces, no tabs, no trailing whitespace
- **Attribute sets**: Use `with pkgs;` for package lists only, explicit `pkgs.` elsewhere for clarity
- **Path references**: Use relative paths (`../theme/wallpaper.jpg`), never absolute unless in `mkOutOfStoreSymlink`
- **Let bindings**: Define reusable values in `let...in` blocks (e.g., `dotfiles = config.lib.file.mkOutOfStoreSymlink "/home/jofre/.dotfiles"`)
- **Comments**: Use `#` for comments, keep minimal; prefer self-documenting code

## Naming Conventions
- **Files**: Use kebab-case (e.g., `hardware-configuration.nix`, `shared/stylix.nix`)
- **Attributes**: Use camelCase (e.g., `homeDirectory`, `allowUnfree`, `stateVersion`)
- **Modules**: Group by concern: `nixos/` (system), `home/` (user), `shared/` (common), `theme/` (styling)

## Project Structure
- **config/nix/**: Main Nix configuration directory with flake.nix
- **nixos/**: System-level NixOS configuration modules
- **home/**: Home-manager user configurations (per-user and shared modules)
- **shared/**: Configurations shared between NixOS and home-manager
- **theme/**: Stylix theme configuration (base16 scheme, wallpapers)

## Best Practices
- Always set `stateVersion = "25.05"` (current system version) and never change it
- Use `mkOutOfStoreSymlink` for dotfiles that change frequently (see `home/shared/configs.nix`)
- Use `inputs.nixpkgs.follows = "nixpkgs"` for flake inputs to avoid version conflicts
- Group packages logically with comments (e.g., `# cli`, `# apps`, `# lsp's`, `# formatters`)
- Enable experimental features: `experimental-features = "nix-command flakes"`
