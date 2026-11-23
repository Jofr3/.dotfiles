# Antigravity CLI (Gemini). ~/.gemini is mostly runtime state (conversations,
# caches, OAuth token, downloaded binaries); only the editable config files
# are linked from the repo.
{
  flake.modules.homeManager.base =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = [ pkgs.antigravity-cli ];

      home.file = {
        ".gemini/antigravity-cli/settings.json".source = "${dotfiles}/config/antigravity/settings.json";
        ".gemini/config/config.json".source = "${dotfiles}/config/antigravity/config.json";
        ".gemini/config/mcp_config.json".source = "${dotfiles}/config/antigravity/mcp_config.json";
      };
    };
}
