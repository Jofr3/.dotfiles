{
  flake.modules.homeManager.desktop =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
      chromeJofre = pkgs.writeShellApplication {
        name = "chrome-jofre";
        runtimeInputs = [ pkgs.google-chrome ];
        text = ''
          exec google-chrome-stable \
            --remote-debugging-port=9222 \
            --user-data-dir="${config.home.homeDirectory}/.config/google-chrome-jofre" \
            "$@"
        '';
      };
    in
    {
      home.packages = [
        pkgs.chromium
        pkgs.google-chrome
        chromeJofre
      ];

      xdg.desktopEntries.google-chrome-jofre = {
        name = "Google Chrome (Jofre)";
        genericName = "Web Browser";
        exec = "${chromeJofre}/bin/chrome-jofre %U";
        icon = "google-chrome";
        terminal = false;
        categories = [
          "Network"
          "WebBrowser"
        ];
        mimeType = [
          "application/xhtml+xml"
          "text/html"
          "x-scheme-handler/about"
          "x-scheme-handler/http"
          "x-scheme-handler/https"
          "x-scheme-handler/unknown"
        ];
      };

      xdg.configFile.qutebrowser.source = "${dotfiles}/config/qutebrowser";
    };
}
