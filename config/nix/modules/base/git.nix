{
  flake.modules.nixos.base =
    { pkgs, ... }:
    {
      environment.systemPackages = [ pkgs.git ];
    };

  flake.modules.homeManager.base =
    { config, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      xdg.configFile.git.source = "${dotfiles}/config/git";
    };
}
