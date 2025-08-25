{
  description = "nixos";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:nixos/nixpkgs/nixos-25.05";
    home-manager = {
      url = "github:nix-community/home-manager/release-25.05";
      inputs.nixpkgs.follows = "nixpkgs-stable";
    };
    stylix = {
      url = "github:danth/stylix/release-25.05";
      inputs.nixpkgs.follows = "nixpkgs-stable";
    };
    neovim-nightly-overlay.url = "github:nix-community/neovim-nightly-overlay";
  };

  outputs = { self, nixpkgs-stable, home-manager, ... }@inputs:
    let
      inherit (self) outputs;
      overlays = [ inputs.neovim-nightly-overlay.overlays.default ];
    in {
      # sudo nixos-rebuild switch --flake .#nixos
      nixosConfigurations = {
        nixos = nixpkgs-stable.lib.nixosSystem {
          specialArgs = { inherit inputs outputs; };
          modules =
            [ ./nixos/configuration.nix inputs.stylix.nixosModules.stylix ];
        };
      };

      # home-manager switch --flake .#jofre@nixos
      homeConfigurations = {
        "jofre@nixos" = home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs-stable.legacyPackages.x86_64-linux;
          extraSpecialArgs = { inherit inputs outputs; };
          modules = [
            ./home/jofre.nix
            inputs.stylix.homeModules.stylix
            { nixpkgs.overlays = overlays; }
          ];
        };
      };
    };
}
