# Desktop tower.  sudo nixos-rebuild switch --flake .#nixos-pc
{ config, ... }:
{
  flake.modules.nixos."hosts/nixos-pc" = {
    imports = with config.flake.modules.nixos; [
      desktop
      amdgpu
    ];

    networking.hostName = "nixos-pc";
    networking.hostId = "6707fc68";
  };
}
