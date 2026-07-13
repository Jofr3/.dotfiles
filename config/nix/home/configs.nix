{ config, ... }:
let
  dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
in
{
  xdg.configFile = {
    git.source = "${dotfiles}/config/git";
    foot.source = "${dotfiles}/config/foot";
    fish.source = "${dotfiles}/config/fish";
    nvim.source = "${dotfiles}/config/nvim";
    mult.source = "${dotfiles}/config/mult";
    tmux.source = "${dotfiles}/config/tmux";
    btop.source = "${dotfiles}/config/btop";
    helix.source = "${dotfiles}/config/helix";
    kitty.source = "${dotfiles}/config/kitty";
    niri.source = "${dotfiles}/config/niri";
    wezterm.source = "${dotfiles}/config/wezterm";
    opencode.source = "${dotfiles}/config/opencode";
    qutebrowser.source = "${dotfiles}/config/qutebrowser";
  };

  home.file.".claude".source = "${dotfiles}/config/claude";
  home.file.".pi".source = "${dotfiles}/config/pi";
}
