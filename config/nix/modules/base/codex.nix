{
  flake.modules.homeManager.base =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = [
        pkgs.codex
        pkgs.agent-browser
      ];

      programs.uv = {
        enable = true;
        tool = {
          packages = [ "sqlit-tui[mssql,mysql,postgres,d1]" ];
          prune = true;
        };
      };

      home.sessionPath = [ "${config.home.homeDirectory}/.local/bin" ];
      home.sessionVariables.CODEX_HOME = "${config.xdg.configHome}/codex";

      # Keep Codex state in CODEX_HOME and editable config in the repo.
      xdg.configFile."codex/config.toml".source = "${dotfiles}/config/codex/config.toml";
    };
}
