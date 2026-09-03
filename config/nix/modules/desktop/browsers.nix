{
  flake.modules.homeManager.desktop =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = with pkgs; [
        chromium
        google-chrome
      ];

      xdg.configFile.qutebrowser.source = "${dotfiles}/config/qutebrowser";
    };
}
