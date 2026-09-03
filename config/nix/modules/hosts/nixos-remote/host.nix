# Headless home server.  sudo nixos-rebuild switch --flake .#nixos-remote
{ config, ... }:
{
  flake.modules.nixos."hosts/nixos-remote" = {
    imports = with config.flake.modules.nixos; [ server ];

    networking.hostName = "nixos-remote";
    networking.hostId = "4b1c9a2e";
  };
}
