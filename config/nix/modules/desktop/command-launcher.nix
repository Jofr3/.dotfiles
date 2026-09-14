{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    let
      commands = {
        "vpn lsw" = {
          command = "fish -c vpn-lsw";
          terminal = true;
        };
        "system resources" = {
          command = "btop";
          terminal = true;
        };
        screenshot.command = "screenshot-satty";
        "keyboard switch layout".command = "niri msg action switch-layout next";
        "color picker".command = "wl-color-picker clipboard";
        dot = {
          command = "dot";
          terminal = true;
        };
        "text correction".command = ''
          claude -p "Correct the following text for grammar and spelling. The text may be in English, Catalan, or Spanish - detect the language and correct it in that same language. Output ONLY the corrected text, nothing else: $(wl-paste)" | wtype -
        '';
      };
      commandsJson = pkgs.writeText "commands-launcher.json" (builtins.toJSON commands);
      commandNames = pkgs.writeText "commands-launcher-menu" (
        builtins.concatStringsSep "\n" (builtins.attrNames commands) + "\n"
      );
      commandsLauncher = pkgs.writeShellApplication {
        name = "commands-launcher";
        excludeShellChecks = [ "SC2016" ];
        runtimeInputs = with pkgs; [
          bash
          coreutils
          fish
          foot
          fzf
          jq
          util-linux
        ];
        text = ''
          temporary=$(mktemp -d)
          trap 'rm -rf "$temporary"' EXIT

          foot --app-id="launcher" bash -c '
            fzf --reverse --padding=1,1,0,2 < "$1" > "$2"
          ' _ ${commandNames} "$temporary/selection" || exit 0

          selected=$(cat "$temporary/selection")
          [ -n "$selected" ] || exit 0

          entry=$(jq -ce --arg name "$selected" '.[$name]' ${commandsJson})
          command=$(jq -er '.command' <<< "$entry")
          terminal=$(jq -r '.terminal // false' <<< "$entry")
          hold=$(jq -r '.hold // false' <<< "$entry")
          app_id=$(jq -r '."app-id" // empty' <<< "$entry")
          [ -n "$app_id" ] || app_id="launcher"

          if [[ "$terminal" == "true" ]]; then
            if [[ "$hold" == "true" ]]; then
              setsid -f foot --app-id="$app_id" bash -c '
                eval "$1"
                printf "\n\nPress any key to close..."
                read -r -n 1 || true
              ' _ "$command" </dev/null
            else
              setsid -f foot --app-id="$app_id" bash -c "$command" </dev/null
            fi
          else
            setsid -f bash -c "$command" </dev/null >/dev/null 2>&1
          fi
        '';
      };
    in
    {
      home.packages = [ commandsLauncher ];

      wayland.windowManager.niri.settings.binds."Super+X".spawn = [
        "${commandsLauncher}/bin/commands-launcher"
      ];
    };
}
