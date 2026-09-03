# config/nix — NixOS + Home Manager, dendritic layout

Flake for four machines: `nixos` (personal laptop, nvidia), `nixos-lsw` (work
laptop, intel), `nixos-pc` (desktop, amdgpu) and `nixos-remote` (headless home
server). Built with flake-parts + import-tree following the dendritic pattern
(https://github.com/mightyiam/dendritic). Read this before editing.

Rebuild: `sudo nixos-rebuild switch --flake .#<host>`

## The three rules

1. **Every file under `modules/` is a flake-parts module and is imported
   automatically.** `flake.nix` is the only entry point. Never write
   `imports = [ ./other-file.nix ]` between files, never add a `default.nix`.
   Files or directories whose name starts with `_` are skipped.

2. **One feature per file.** A file owns one thing (fish, tailscale, niri, a
   host) and writes into `flake.modules.nixos.<name>` and/or
   `flake.modules.homeManager.<name>`. Many files writing to the same name
   merge into one module. Both the NixOS and the Home Manager side of a
   feature live in the same file.

3. **Hosts are just modules named `hosts/<hostname>`.** `modules/hosts.nix`
   turns every one of them into `nixosConfigurations.<hostname>`. Nothing else
   needs to be registered anywhere.

## Module names in use

| Name | Meaning |
|---|---|
| `base` | every machine, NixOS and Home Manager |
| `desktop` | graphical workstations; imports `base` |
| `server` | headless boxes; imports `base` |
| `nvidia`, `amdgpu`, `intel-graphics` | GPU, NixOS only |
| `hosts/<hostname>` | one per machine |

A host imports exactly one layer (`desktop` or `server`) plus its hardware
modules. It must never import `base` directly: the layer already does, and
attrset modules are not deduplicated, so a second import would define
everything twice. Layering lives in `modules/layers.nix`, the Home Manager
wiring per layer in `modules/home-manager.nix`.

## Layout

```
flake.nix                   inputs + one line: mkFlake { inherit inputs; } (import-tree ./modules)
modules/
  flake-parts.nix           systems, flakeModules.modules, formatter
  hosts.nix                 hosts/* -> nixosConfigurations
  layers.nix                desktop and server import base
  home-manager.nix          HM as a NixOS module, users.jofre imports the HM side of each layer
  base/                     features every machine gets (boot, nix, user, fish, ssh, docker, sops, packages, ...)
  desktop/                  graphical features (niri, audio, stylix, wayland, terminals, browsers, mime, ...)
  server/                   headless features (openssh, firewall, gc, auto-upgrade, no-sleep, ...)
  hardware/                 GPU modules
  hosts/<hostname>/         host.nix (hostname, hostId, imports) + hardware.nix (wrapped nixos-generate-config)
theme/  secrets/  .sops.yaml
```

Directories are only a grouping aid. A file may write to any module name; for
example `base/tailscale.nix` enables Tailscale in `base` and adds the
server-only firewall trust under `server`, because both are "the tailscale
feature".

## Recipes

**Add a package.** If a feature file exists for it, put it there
(`docker-compose` lives in `base/docker.nix`). Otherwise `base/packages.nix`
for every machine, `desktop/packages.nix` for GUI apps, `server/packages.nix`
for headless extras.

**Add a feature.** Create `modules/<layer>/<feature>.nix`. Template:

```nix
{ inputs, ... }:                 # only if you need a flake input
{
  flake.modules.nixos.desktop =
    { pkgs, ... }:
    {
      programs.foo.enable = true;
    };

  flake.modules.homeManager.desktop =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = [ pkgs.foo-cli ];
      xdg.configFile.foo.source = "${dotfiles}/config/foo";   # live symlink into the repo
    };
}
```

Both halves are optional; a file can be NixOS-only or Home Manager-only.
Flake inputs are reached by closure from the file's top-level arguments, so
there is no `specialArgs` to thread through.

**Add a host.** Create `modules/hosts/<hostname>/host.nix`:

```nix
{ config, ... }:
{
  flake.modules.nixos."hosts/<hostname>" = {
    imports = with config.flake.modules.nixos; [ desktop nvidia ];
    networking.hostName = "<hostname>";
    networking.hostId = "<8 hex chars>";
  };
}
```

and `hardware.nix` next to it: the body of `nixos-generate-config
--show-hardware-config` wrapped as
`flake.modules.nixos."hosts/<hostname>" = { config, lib, modulesPath, ... }: { ... };`.
Never paste the generated file at top level; it is not a flake-parts module.

**Add a hardware module.** `modules/hardware/<name>.nix` writing
`flake.modules.nixos.<name>`, then list `<name>` in the host's imports.

**Link a config directory from the repo.** Pure symlinks with no other config
go in `base/dotfiles.nix`; if the program has its own feature file, put the
symlink there (`fish.nix`, `git.nix`, `niri.nix`, `terminals.nix`).

**Secrets.** `base/sops.nix`, data in `secrets/secrets.yaml`, keys in
`.sops.yaml`. Decrypted with the age key derived from `~/.ssh/keys/sops`.

## Before rebuilding

1. `git add` new files. Flakes only see tracked files; a forgotten file
   silently disappears from the config.
2. Evaluate every host, not just the one you are on:
   ```
   for h in nixos nixos-lsw nixos-pc nixos-remote; do
     nix eval --raw .#nixosConfigurations.$h.config.system.build.toplevel.drvPath && echo
   done
   ```
3. Check for typos in module names. A misspelled name creates a new module
   nobody imports, with no error:
   ```
   nix eval .#modules.nixos --apply builtins.attrNames
   nix eval .#modules.homeManager --apply builtins.attrNames
   ```
   Expected: base, desktop, server, the three GPU modules and four `hosts/*`
   for nixos; base, desktop, server for homeManager.
4. `nix fmt`.

For a refactor that should change nothing, record the drvPaths from step 2
before starting and compare afterwards. If they differ, `nix run
--inputs-from . nixpkgs#nix-diff -- old.drv new.drv` shows why. Package lists
are concatenated in file order, so moving packages between files reorders
`environment.systemPackages` and `home.packages`; that rehashes the
buildEnv derivations but does not change their content. Building both
toplevels and running `nix store diff-closures old new` (or `nvd diff`) is
the definitive check.

## Gotchas

- The flake root is the whole `~/.dotfiles` git repo (`?dir=config/nix`), so
  the "Git tree is dirty" warning is normal and any change anywhere in the
  repo changes the source hash.
- Two `stdenv.isLinux`/`isDarwin` deprecation warnings during evaluation come
  from nixpkgs, not from this config.
- Module bodies that reference `config.flake.modules.*` are lazy; referencing
  other named modules from inside a module is fine and is how layering works.
- Tailscale enrolment (`sudo tailscale up`) and the initial user password are
  manual, once per machine; see the comments in `base/tailscale.nix` and
  `base/user.nix`.
