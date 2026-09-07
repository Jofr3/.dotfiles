{
  flake.modules.homeManager.desktop =
    { config, lib, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      # Stylix's foot target fills in the colour palette and the font; the
      # font is forced back to what this config has always used.
      programs.foot = {
        enable = true;

        # niri binds Super+Return to footclient. Run the server as a systemd
        # user unit instead of niri's spawn-at-startup so that a rebuild
        # restarts it; a hand-spawned server keeps the foot.ini it read at
        # login and silently ignores every later config change.
        server.enable = true;

        settings = {
          main = {
            term = "foot";
            font = lib.mkForce "FiraCodeNerdFontMono:size=10";
            line-height = 11;
            # niri's window rule matches app-id="terminal"; in server mode
            # foot would otherwise announce itself as "footclient".
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
