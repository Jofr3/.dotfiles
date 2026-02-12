{
  description = "NixOS and Home Manager configuration";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    stylix = {
      url = "github:nix-community/stylix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, home-manager, ... }@inputs:
    let
      mkHost = { hostName, hostId, hardware }:
        nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs hostId; };
          modules = [
            ./machines/common.nix
            home-manager.nixosModules.home-manager
            {
              networking.hostName = hostName;
              networking.hostId = hostId;
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.extraSpecialArgs = { inherit inputs hostId; };
              home-manager.users.jofre = import ./home;
            }
          ] ++ hardware;
        };
    in
    {
      # sudo nixos-rebuild switch --flake .#nixos
      nixosConfigurations.nixos = mkHost {
        hostName = "nixos";
        hostId = "9f0dfe7d";
        hardware = [
          ./machines/personal/hardware.nix
          ./machines/personal/graphics.nix
        ];
      };

      # sudo nixos-rebuild switch --flake .#nixos-lsw
      nixosConfigurations.nixos-lsw = mkHost {
        hostName = "nixos-lsw";
        hostId = "27e15669";
        hardware = [
          ./machines/work/hardware.nix
          ./machines/work/graphics.nix
        ];
      };
    };
}
