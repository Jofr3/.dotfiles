# Work laptop.  sudo nixos-rebuild switch --flake .#nixos-lsw
{ config, ... }:
{
  flake.modules.nixos."hosts/nixos-lsw" = {
    imports = with config.flake.modules.nixos; [
      desktop
      intel-graphics
    ];

    networking.hostName = "nixos-lsw";
    networking.hostId = "27e15669";

    # 8 GB of RAM: limit parallel local builds so a rebuild doesn't push the
    # desktop into swap (default is 8 jobs x all cores).
    nix.settings = {
      max-jobs = 2;
      cores = 4;
    };
  };
}
