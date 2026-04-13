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

  outputs = { self, nixpkgs, home-manager, sops-nix, ... }@inputs:
    let
      cursorOverlay = final: prev: {
        code-cursor = prev.code-cursor.overrideAttrs (old: rec {
          version = "3.0.12";
          src = prev.appimageTools.extract {
            pname = "cursor";
            inherit version;
            src = prev.fetchurl {
              url = "https://downloads.cursor.com/production/a80ff7dfcaa45d7750f6e30be457261379c29b06/linux/x64/Cursor-3.0.12-x86_64.AppImage";
              hash = "sha256-dUAF18h48nzLW+pjcAGeY0c7jZVbwD/3ceczZXxKJv0=";
            };
          };
          sourceRoot = "cursor-${version}-extracted/usr/share/cursor";
        });
      };

      mkHost = { hostName, hostId, hardware }:
        nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs hostId; };
          modules = [
            { nixpkgs.overlays = [ cursorOverlay ]; }
            ./machines/common.nix
            sops-nix.nixosModules.sops
            home-manager.nixosModules.home-manager
            {
              networking.hostName = hostName;
              networking.hostId = hostId;
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.backupFileExtension = "bak";
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

      # sudo nixos-rebuild switch --flake .#nixos-pc
      nixosConfigurations.nixos-pc = mkHost {
        hostName = "nixos-pc";
        hostId = "6707fc68";
        hardware = [
          ./machines/desktop/hardware.nix
          ./machines/desktop/graphics.nix
        ];
      };
    };
}
