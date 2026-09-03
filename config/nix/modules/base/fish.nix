{
  flake.modules.nixos.base =
    { pkgs, ... }:
    {
      programs.fish.enable = true;
      users.users.jofre.shell = pkgs.fish;
    };

  flake.modules.homeManager.base =
    { config, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      xdg.configFile.fish.source = "${dotfiles}/config/fish";
    };
}
