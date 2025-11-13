# Agent Guidelines for NixOS Dotfiles

## Build/Test Commands
- **Rebuild NixOS system**: `sudo nixos-rebuild switch --flake .#nixos`
- **Rebuild home-manager**: `home-manager switch --flake .#jofre@nixos`
- **Check flake syntax**: `nix flake check`
- **Format Nix files**: `nixfmt-classic <file>`

## Code Style
- **Imports**: Use explicit imports, follow pattern `{ inputs, lib, pkgs, ... }: { imports = [ ... ]; }`
- **Formatting**: Use 2-space indentation, no trailing whitespace
- **Attribute sets**: Use `with pkgs;` for package lists, explicit references otherwise
- **Path references**: Use relative paths (`../theme/wallpaper.jpg`) for local resources
- **Comments**: Use `#` for comments, keep them minimal and meaningful
- **File organization**: Group related configs (nixos/, home/, shared/, theme/)

## Naming Conventions
- **Files**: Use kebab-case for config files (e.g., `hardware-configuration.nix`)
- **Attributes**: Use camelCase for Nix attributes (e.g., `homeDirectory`, `allowUnfree`)
- **Modules**: Organize by concern (packages, configs, services)

## Best Practices
- Always specify `stateVersion` to match current system
- Use `mkOutOfStoreSymlink` for dotfiles that change frequently
- Follow nixpkgs-unstable channel conventions
- Keep flake inputs minimal and use `inputs.nixpkgs.follows` for dependencies
