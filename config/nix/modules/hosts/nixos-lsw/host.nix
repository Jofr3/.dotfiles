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
  };
}
