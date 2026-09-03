# Config directories symlinked straight into the repo, so edits take effect
# without a rebuild. Programs that also have a NixOS side (fish, git, niri,
# terminals, browsers) link their config from their own feature file.
{
  flake.modules.homeManager.base =
    { config, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      xdg.configFile = {
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
    };
}
