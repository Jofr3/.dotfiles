{
  flake.modules.homeManager.desktop =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = with pkgs; [
        foot
        kitty
      ];

      xdg.configFile = {
        foot.source = "${dotfiles}/config/foot";
        kitty.source = "${dotfiles}/config/kitty";
      };
    };
}
