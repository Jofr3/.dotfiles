---
name: nix-dotfiles-workflow
description: Use when working on Jofre's NixOS/Home Manager dotfiles, especially ~/.dotfiles/config/nix, flake.nix, flake.lock, machine modules, Home Manager symlinks, Hyprland, Stylix/theming, or dotfiles merge conflicts/rebuilds.
---

# Nix Dotfiles Workflow

Load this skill before editing `~/.dotfiles/config/nix` or resolving dotfiles merge conflicts that touch Nix, Home Manager, Hyprland, Stylix, or generated `flake.lock` changes.

## Repo layout

- Dotfiles root: `/home/jofre/.dotfiles`
- Nix flake root: `/home/jofre/.dotfiles/config/nix`
- Flake entrypoint: `config/nix/flake.nix`
- Shared system config: `config/nix/machines/common.nix`
- Host-specific hardware/graphics:
  - `machines/personal/` → `nixos`, NVIDIA, `hostId = "9f0dfe7d"`
  - `machines/work/` → `nixos-lsw`, Intel modesetting, `hostId = "27e15669"`
  - `machines/desktop/` → `nixos-pc`, AMD, `hostId = "6707fc68"`
- Home Manager modules: `config/nix/home/`
  - `default.nix`: user prefs, GTK, MIME, Stylix HM enablement
  - `configs.nix`: `mkOutOfStoreSymlink` links from repo into `~/.config`
  - `hyprland.nix`: keybindings, monitor layout, workspace rules
  - `packages.nix`: user packages
  - `sops.nix`, `ssh.nix`: secrets and SSH config
- Theme assets: `config/nix/theme/wallpaper.jpg`

## Before editing

1. Check location and git state:
   ```bash
   cd /home/jofre/.dotfiles/config/nix
   git -C /home/jofre/.dotfiles status --short
   ```
2. Read nearby module context before changing imports/options.
3. Treat `hardware.nix` as generated/host-specific; avoid manual edits unless the user asks.
4. For merge conflicts, inspect both sides and preserve host-specific differences instead of normalizing all hosts.

## Common commands

Run from `/home/jofre/.dotfiles/config/nix` unless a full path is shown.

```bash
# Format one Nix file
nixfmt path/to/file.nix

# Validate flake structure/evaluation without switching generations
nix flake check

# Build/test current host config without making it boot default
sudo nixos-rebuild test --flake .#$(hostname)

# Switch current host after validation/user approval
sudo nixos-rebuild switch --flake .#$(hostname)

# Explicit host switches
sudo nixos-rebuild switch --flake .#nixos
sudo nixos-rebuild switch --flake .#nixos-lsw
sudo nixos-rebuild switch --flake .#nixos-pc

# Update inputs only when requested
nix flake update
```

Fish aliases may exist: `nr` = NixOS rebuild, `hr` = Home Manager rebuild, `nd` = `nix develop`. Prefer explicit commands in agent work so logs are clear.

## Home Manager/dotfile symlink pattern

`home/configs.nix` uses `config.lib.file.mkOutOfStoreSymlink` pointing at `/home/jofre/.dotfiles`. Many app config edits take effect immediately because the files are symlinked; adding a new linked app requires adding an `xdg.configFile` or `home.file` entry and rebuilding.

Home Manager is integrated into the NixOS flake via `home-manager.nixosModules.home-manager`, `home-manager.useGlobalPkgs = true`, and `home-manager.users.jofre = import ./home`. Do not assume a separate standalone `homeConfigurations` output exists.

## Machine-specific caveats

- `hostId` is passed through `specialArgs` and `extraSpecialArgs`; modules can branch on it.
- `home/hyprland.nix` currently treats `hostId == "9f0dfe7d"` as personal/dual-monitor and all others as single-monitor.
- Graphics stacks differ by host:
  - personal: proprietary NVIDIA driver
  - work: Intel modesetting + Intel VA packages
  - desktop: AMDGPU
- Keep shared settings in `machines/common.nix`; only put hardware/monitor/driver differences under host directories or guarded by `hostId`.

## Stylix/theming workflow

- Stylix is enabled at the NixOS level in `machines/common.nix` via `inputs.stylix.nixosModules.stylix`.
- Stylix is also enabled in Home Manager via `home/default.nix` (`stylix.enable = true`). Keep both levels in sync.
- Current scheme: `rose-pine-moon`; wallpaper: `config/nix/theme/wallpaper.jpg`.
- Hyprland may override Stylix-generated values with `lib.mkForce` (e.g. groupbar colors). Preserve those overrides unless intentionally changing theme behavior.
- Theme changes usually need a rebuild/test and sometimes session/app restart to see effects.

## Safe validation sequence

For non-lockfile Nix edits:

```bash
cd /home/jofre/.dotfiles/config/nix
nixfmt changed-file.nix
nix flake check
sudo nixos-rebuild test --flake .#$(hostname)
```

Only run `switch`, `nix flake update`, or push changes after explicit user intent. Report any host-specific config you did not validate.

## Merge-conflict checklist

- Resolve `flake.lock` conflicts mechanically only when the intended input version is clear; otherwise ask before choosing versions or running `nix flake update`.
- For module conflicts, preserve imports, `specialArgs`/`extraSpecialArgs`, and all host outputs.
- After conflict resolution: `git diff --check`, `nixfmt` touched `.nix` files, then `nix flake check`.
