# Home Manager runs as a NixOS module. Each layer pulls in its Home Manager
# counterpart, so a feature file can contribute to both sides under one name.
{ config, inputs, ... }:
let
  hm = config.flake.modules.homeManager;
in
{
  flake.modules.nixos.base =
    { pkgs, ... }:
    {
      imports = [ inputs.home-manager.nixosModules.home-manager ];

      environment.systemPackages = [
        inputs.home-manager.packages.${pkgs.stdenv.hostPlatform.system}.home-manager
      ];

      home-manager = {
        useGlobalPkgs = true;
        useUserPackages = true;
        backupFileExtension = "bak";
        users.jofre.imports = [ hm.base ];
      };
    };

  flake.modules.nixos.desktop.home-manager.users.jofre.imports = [ hm.desktop ];
  flake.modules.nixos.server.home-manager.users.jofre.imports = [ hm.server ];
}
