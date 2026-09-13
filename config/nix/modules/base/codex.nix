{
  flake.modules.homeManager.base =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = [ pkgs.codex ];
      home.sessionVariables.CODEX_HOME = "${config.xdg.configHome}/codex";

      # Keep Codex state in CODEX_HOME and only the editable config in the repo.
      xdg.configFile."codex/config.toml".source = "${dotfiles}/config/codex/config.toml";
    };
}
