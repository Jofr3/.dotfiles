{ inputs, ... }:
{
  flake.modules.homeManager.base =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      # Update the Git revision with `nix flake update mult`, then rebuild.
      home.packages = [ inputs.mult.packages.${pkgs.stdenv.hostPlatform.system}.default ];

      xdg.configFile.mult.source = "${dotfiles}/config/mult";
    };
}
