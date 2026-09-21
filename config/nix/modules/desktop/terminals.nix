{
  flake.modules.homeManager.desktop =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      # Stylix's foot target fills in the colour palette and the font; the
      # font is forced back to what this config has always used.
      programs.foot = {
        enable = true;

        server.enable = false;

        settings = {
          main = {
            term = "foot";
            font = lib.mkForce "FiraCodeNerdFontMono:size=10";
            line-height = 11;
            # niri's window rule matches app-id="terminal".
            app-id = "terminal";
          };
          cursor.style = "beam";
          mouse.hide-when-typing = "yes";
        };
      };

      home.packages = with pkgs; [ kitty ];

      xdg.configFile.kitty.source = "${dotfiles}/config/kitty";
    };
}
