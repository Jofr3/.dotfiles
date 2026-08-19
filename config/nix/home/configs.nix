{ config, ... }:
let
  dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
in
{
  xdg.configFile = {
    git.source = "${dotfiles}/config/git";
    fish.source = "${dotfiles}/config/fish";
    nvim.source = "${dotfiles}/config/nvim";
    mult.source = "${dotfiles}/config/mult";
    tmux.source = "${dotfiles}/config/tmux";
    btop.source = "${dotfiles}/config/btop";
    helix.source = "${dotfiles}/config/helix";
    yazi.source = "${dotfiles}/config/yazi";
    opencode.source = "${dotfiles}/config/opencode";
  };

  home.file.".claude" = {
    source = "${dotfiles}/config/claude";
    recursive = true;
  };
  home.file.".pi".source = "${dotfiles}/config/pi";
}
