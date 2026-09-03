{
  flake.modules.nixos.desktop = {
    networking.networkmanager.enable = true;
    users.users.jofre.extraGroups = [ "networkmanager" ];
  };
}
