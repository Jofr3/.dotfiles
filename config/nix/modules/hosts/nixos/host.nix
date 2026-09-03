# Personal laptop.  sudo nixos-rebuild switch --flake .#nixos
{ config, ... }:
{
  flake.modules.nixos."hosts/nixos" = {
    imports = with config.flake.modules.nixos; [
      desktop
      nvidia
    ];

    networking.hostName = "nixos";
    networking.hostId = "9f0dfe7d";
  };
}
