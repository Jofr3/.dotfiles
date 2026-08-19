{ config, ... }:
let
  dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
in
{
  xdg.configFile = {
    foot.source = "${dotfiles}/config/foot";
    kitty.source = "${dotfiles}/config/kitty";
    niri.source = "${dotfiles}/config/niri";
    wezterm.source = "${dotfiles}/config/wezterm";
    qutebrowser.source = "${dotfiles}/config/qutebrowser";
  };
}
