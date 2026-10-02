{
  description = "NixOS and Home Manager configuration";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    # herdr fails to link with gcc 16 / binutils 2.46 ("overlapping FDEs" in
    # the zig-built libghostty-vt); build it from the last gcc 15 revision.
    # Drop once herdr builds on nixpkgs again.
    nixpkgs-herdr.url = "github:nixos/nixpkgs/e158d9ed9b51c98974c5e66e1ba1c9e0255fecaa";

    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };

    import-tree.url = "github:vic/import-tree";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    mult = {
      url = "github:Jofr3/mult";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    stylix = {
      url = "github:nix-community/stylix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  # Dendritic layout: every file under ./modules is a flake-parts module and is
  # imported automatically (paths with a `_`-prefixed component are skipped).
  # A file owns one feature and writes into flake.modules.{nixos,homeManager}.<name>;
  # hosts are the modules named "hosts/<hostname>" -- see modules/hosts.nix.
  outputs = inputs: inputs.flake-parts.lib.mkFlake { inherit inputs; } (inputs.import-tree ./modules);
}
