{
  flake.modules.nixos.desktop = {
    programs.niri.enable = true;

    services.gnome.gcr-ssh-agent.enable = false;
  };

  flake.modules.homeManager.desktop =
    {
      config,
      osConfig,
      pkgs,
      ...
    }:
    let
      dotfiles = "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = [
        pkgs.brightnessctl
        pkgs.swayimg
      ];

      wayland.windowManager.niri = {
        enable = true;
        package = pkgs.niri;
        checkConfig = true;
        systemd.enable = false;
        portalPackage = null;

        settings = {
          # foot --server runs as a systemd user unit in terminals.nix.
          spawn-at-startup = [
            "swaybg"
            "-i"
            "${dotfiles}/config/nix/theme/wallpaper.jpg"
            "-m"
            "fill"
          ];

          prefer-no-csd = { };
          screenshot-path = "~/Pictures/Screenshots/%Y-%m-%d_%H-%M-%S.png";
          hotkey-overlay.skip-at-startup = { };

          environment = {
            NIXOS_OZONE_WL = "1";
            XCURSOR_SIZE = "24";
            QT_CURSOR_SIZE = "24";
          };

          cursor = {
            xcursor-theme = "Vanilla-DMZ";
            xcursor-size = 24;
            hide-when-typing = { };
          };

          input = {
            keyboard = {
              xkb = {
                layout = "us,ca";
                options = "ctrl:nocaps";
              };
              repeat-delay = 250;
              repeat-rate = 30;
            };
            touchpad.tap = { };
          };

          gestures.hot-corners.off = { };

          layout = {
            gaps = 0;
            center-focused-column = "always";
            default-column-width.proportion = 1.0;

            focus-ring = {
              width = 0;
              active-color = "#c4a7e7";
              inactive-color = "#6e6a86";
              urgent-color = "#eb6f92";
            };
            border.off = { };
            shadow.off = { };
          };

          animations = { };

          # Repeated KDL nodes use _children to preserve declaration order.
          _children = [
            # Monitors
            {
              output = {
                _args = [ "HDMI-A-1" ];
                mode = "1920x1080";
                position._props = {
                  x = 0;
                  y = 0;
                };
                focus-at-startup = { };
              };
            }
            {
              output = {
                _args = [ "eDP-1" ];
                mode = "1920x1080";
                position._props = {
                  x = 0;
                  y = 1080;
                };
              };
            }

            # Named workspaces, in their original order.
            {
              workspace = {
                _args = [ "mail" ];
                open-on-output = "HDMI-A-1";
              };
            }
            {
              workspace = {
                _args = [ "chrome" ];
                open-on-output = "HDMI-A-1";
              };
            }
            {
              workspace = {
                _args = [ "terminal" ];
                open-on-output = "HDMI-A-1";
              };
            }
            {
              workspace = {
                _args = [ "database" ];
                open-on-output = "HDMI-A-1";
              };
            }

            # Window rules
            {
              window-rule = {
                match._props.app-id = "launcher";
                open-floating = true;
                geometry-corner-radius = 15;
                clip-to-geometry = true;
              };
            }
            {
              window-rule = {
                match._props.app-id = "thunderbird";
                open-on-workspace = "mail";
              };
            }
            {
              window-rule = {
                match._props.app-id = "google-chrome";
                open-on-workspace = "chrome";
              };
            }
            {
              window-rule = {
                match._props.app-id = "terminal";
                open-on-workspace = "terminal";
              };
            }
            {
              window-rule = {
                match._props.app-id = "DBeaver";
                open-on-workspace = "database";
              };
            }
          ];

          binds = {
            # Window management
            "Super+Q".close-window = { };

            # Workspaces
            "Super+M".focus-workspace = "mail";
            "Super+W".focus-workspace = "chrome";
            "Super+I".focus-workspace = "terminal";
            "Super+D".focus-workspace = "database";

            # Overview
            "Super+Space".toggle-overview = { };

            # Focus by index
            "Super+1".focus-column = 1;
            "Super+2".focus-column = 2;
            "Super+3".focus-column = 3;
            "Super+4".focus-column = 4;
            "Super+5".focus-column = 5;

            # Focus
            "Super+H".focus-column-left = { };
            "Super+L".focus-column-right = { };
            "Super+J".focus-workspace-down = { };
            "Super+K".focus-workspace-up = { };

            # Movement
            "Super+Shift+H".move-column-left = { };
            "Super+Shift+L".move-column-right = { };
            "Super+Shift+J".move-window-to-workspace-down = { };
            "Super+Shift+K".move-window-to-workspace-up = { };

            # Resize
            "Super+Ctrl+H".set-column-width = "-10%";
            "Super+Ctrl+L".set-column-width = "+10%";

            # Maximize
            "Super+F".maximize-column = { };

            # Brightness
            "Super+Left".spawn = [
              "brightnessctl"
              "set"
              "5%-"
            ];
            "Super+Right".spawn = [
              "brightnessctl"
              "set"
              "+5%"
            ];

            # Volume
            "Super+Up".spawn = [
              "pactl"
              "set-sink-volume"
              "@DEFAULT_SINK@"
              "+5%"
            ];
            "Super+Down".spawn = [
              "pactl"
              "set-sink-volume"
              "@DEFAULT_SINK@"
              "-5%"
            ];

            # Help menu
            "Super+Shift+Slash".show-hotkey-overlay = { };

            # Launchers
            "Super+Return".spawn = [ "footclient" ];
            "Super+U".spawn = [
              "bash"
              "${dotfiles}/scripts/bookmarks-launcher.sh"
            ];
          };
        };
      };
    };
}
