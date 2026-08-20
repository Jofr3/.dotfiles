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

    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      nixpkgs,
      home-manager,
      ...
    }@inputs:
    let
      # A profile pairs a NixOS module with the matching home-manager entry
      # point. Everything both profiles share lives in machines/common.nix and
      # home/common.nix.
      profiles = {
        desktop = {
          system = ./profiles/desktop.nix;
          home = ./home/desktop;
        };
        remote = {
          system = ./profiles/remote.nix;
          home = ./home/remote;
        };
      };

      mkHost =
        {
          hostName,
          hostId,
          profile ? "desktop",
          hardware,
        }:
        nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs; };
          modules = [
            ./machines/common.nix
            profiles.${profile}.system
            home-manager.nixosModules.home-manager
            {
              networking.hostName = hostName;
              networking.hostId = hostId;
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.backupFileExtension = "bak";
              home-manager.extraSpecialArgs = { inherit inputs; };
              home-manager.users.jofre = import profiles.${profile}.home;
            }
          ]
          ++ hardware;
        };
    in
    {
      # sudo nixos-rebuild switch --flake .#nixos
      nixosConfigurations.nixos = mkHost {
        hostName = "nixos";
        hostId = "9f0dfe7d";
        profile = "desktop";
        hardware = [
          ./machines/personal/hardware.nix
          ./machines/personal/graphics.nix
        ];
      };

      # sudo nixos-rebuild switch --flake .#nixos-lsw
      nixosConfigurations.nixos-lsw = mkHost {
        hostName = "nixos-lsw";
        hostId = "27e15669";
        profile = "desktop";
        hardware = [
          ./machines/work/hardware.nix
          ./machines/work/graphics.nix
        ];
      };

      # sudo nixos-rebuild switch --flake .#nixos-pc
      nixosConfigurations.nixos-pc = mkHost {
        hostName = "nixos-pc";
        hostId = "6707fc68";
        profile = "desktop";
        hardware = [
          ./machines/desktop/hardware.nix
          ./machines/desktop/graphics.nix
        ];
      };

      # sudo nixos-rebuild switch --flake .#nixos-remote
      nixosConfigurations.nixos-remote = mkHost {
        hostName = "nixos-remote";
        hostId = "4b1c9a2e";
        profile = "remote";
        hardware = [
          ./machines/remote/hardware.nix
          ./machines/remote/network.nix
        ];
      };
    };
}
