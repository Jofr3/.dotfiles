{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    let
      apps = {
        Bluetooth = "overskride";
        Calculator = "gnome-calculator";
        Chromium = {
          command = "chromium";
          workspace = "chrome";
        };
        Helium = "helium";
        Dbeaver = "dbeaver";
        Displays = "wdisplays";
        Emacs = "emacsclient -c";
        Nautilus = "nautilus";
        Firefox = "firefox";
        "Google chrome" = {
          command = "chrome-jofre";
          workspace = "chrome";
        };
        Kitty = "kitty";
        Thunderbird = {
          command = "thunderbird";
          workspace = "mail";
        };
        VSCode = "code";
        Bitwarden = "bitwarden";
        Postman = "postman";
        "1Password" = "1password";
      };

      appsJson = pkgs.writeText "apps-launcher.json" (builtins.toJSON apps);
      appNames = pkgs.writeText "apps-launcher-menu" (
        builtins.concatStringsSep "\n" (builtins.attrNames apps) + "\n"
      );
      appsLauncher = pkgs.writeShellApplication {
        name = "apps-launcher";
        excludeShellChecks = [ "SC2016" ];
        runtimeInputs = with pkgs; [
          bash
          coreutils
          fish
          foot
          fzf
          jq
          niri
          util-linux
        ];
        text = ''
          temporary=$(mktemp -d)
          trap 'rm -rf "$temporary"' EXIT

          foot --app-id="launcher" bash -c '
            fzf --reverse --no-scrollbar --padding=1,1,0,2 < "$1" > "$2"
          ' _ ${appNames} "$temporary/selection" || exit 0

          selected=$(cat "$temporary/selection")
          [ -n "$selected" ] || exit 0

          entry=$(jq -c --arg app "$selected" '.[$app]' ${appsJson})
          command=$(jq -r 'if type == "object" then .command else . end' <<< "$entry")
          workspace=$(jq -r 'if type == "object" then .workspace // empty else empty end' <<< "$entry")

          if [ -n "$workspace" ]; then
            niri msg action focus-workspace "$workspace" || true
          fi

          setsid -f ${pkgs.runtimeShell} -c "$command" </dev/null >/dev/null 2>&1
        '';
      };
    in
    {
      home.packages = [ appsLauncher ];

      wayland.windowManager.niri.settings.binds."Super+O".spawn = [
        "${appsLauncher}/bin/apps-launcher"
      ];
    };
}
