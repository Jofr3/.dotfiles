{ config, ... }:
let
  dotfiles = config.lib.file.mkOutOfStoreSymlink "/home/jofre/.dotfiles";
in
{
  xdg.configFile = {
    git.source = "${dotfiles}/config/git";
    foot.source = "${dotfiles}/config/foot";
    fish.source = "${dotfiles}/config/fish";
    tofi.source = "${dotfiles}/config/tofi";
    nvim.source = "${dotfiles}/config/nvim";
    btop.source = "${dotfiles}/config/btop";
    kitty.source = "${dotfiles}/config/kitty";
    zellij.source = "${dotfiles}/config/zellij";
    wezterm.source = "${dotfiles}/config/wezterm";
    qutebrowser.source = "${dotfiles}/config/qutebrowser";
  };
}

