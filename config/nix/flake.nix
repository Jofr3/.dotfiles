{
  description = "nixos";

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
      inherit (self) outputs;
      # overlays = [ inputs.neovim-nightly-overlay.overlays.default ];
    in {
      # sudo nixos-rebuild switch --flake .#nixos
      nixosConfigurations = {
        nixos = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs outputs; };
          modules = [ 
            ./nixos/configuration.nix 
          ];
        };
      };

      # home-manager switch --flake .#jofre@nixos
      homeConfigurations = {
        "jofre@nixos" = home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.x86_64-linux;
          extraSpecialArgs = { inherit inputs outputs; };
          modules = [
            ./home/jofre.nix
            # inputs.stylix.homeModules.stylix
            # { nixpkgs.overlays = overlays; }
          ];
        };
      };
    };
}
