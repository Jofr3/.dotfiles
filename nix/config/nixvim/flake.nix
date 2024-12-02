{
  description = "nixvim config";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    nixvim.url = "github:nix-community/nixvim";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = { nixvim, flake-parts, ... }@inputs:
    flake-parts.lib.mkFlake { inherit inputs; } {
      perSystem = { pkgs, system, ... }:
        let
          nixvimModule = {
            inherit pkgs;
            #module = import ./config;
            extraSpecialArgs = {
              # inherit (inputs) foo;
            };
          };
          nvim = nixvim'.makeNixvimWithModule nixvimModule;
        in
        {
          #checks = {
          #  # Run `nix flake check .` to verify that your config is not broken
          #  default = nixvimLib.check.mkTestDerivationFromNixvimModule nixvimModule;
          #};

          #packages = {
          #  # Lets you run `nix run .` to start nixvim
          #  default = nvim;
          #};
        };
    };
}
