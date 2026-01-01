{ config, ... }:
let dotfiles = config.lib.file.mkOutOfStoreSymlink "/home/jofre/.dotfiles";
in {
  xdg.configFile = {
    git.source = "${dotfiles}/config/git";
    zed.source = "${dotfiles}/config/zed";
    foot.source = "${dotfiles}/config/foot";
    fish.source = "${dotfiles}/config/fish";
    tofi.source = "${dotfiles}/config/tofi";
    nvim.source = "${dotfiles}/config/nvim";
    tmux.source = "${dotfiles}/config/tmux";
    btop.source = "${dotfiles}/config/btop";
    helix.source = "${dotfiles}/config/helix";
    kitty.source = "${dotfiles}/config/kitty";
    zellij.source = "${dotfiles}/config/zellij";
    wezterm.source = "${dotfiles}/config/wezterm";
    opencode.source = "${dotfiles}/config/opencode";
    qutebrowser.source = "${dotfiles}/config/qutebrowser";
  };

  home.file.".claude".source = "${dotfiles}/config/claude";
}

