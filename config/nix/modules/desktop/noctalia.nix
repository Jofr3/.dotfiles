# Noctalia owns the desktop-shell layer around Niri: bar, panels, launcher,
# notifications, wallpaper, OSDs, and lock/session surfaces.
{
  flake.modules.nixos.desktop = {
    programs.noctalia = {
      enable = true;
      recommendedServices.enable = true;
    };
  };

  flake.modules.homeManager.desktop =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      dotfiles = "${config.home.homeDirectory}/.dotfiles";
      toml = pkgs.formats.toml { };

      settings = {
        shell = {
          corner_radius_scale = 0.75;
          font_family = "FiraCode Nerd Font";
          time_format = "{:%H:%M}";
          date_format = "%A, %d %B";
          telemetry_enabled = false;
          settings_show_advanced = true;

          animation = {
            enabled = true;
            speed = 1.2;
          };

          launcher = {
            compact = true;
            app_grid = false;
            sort_by_usage = true;
          };

          panel = {
            transparency_mode = "solid";
            borders = true;
            shadow = false;
            launcher_placement = "floating";
            launcher_position = "center";
            clipboard_placement = "floating";
            clipboard_position = "center";
            control_center_placement = "attached";
            wallpaper_placement = "attached";
            session_placement = "attached";
          };
        };

        theme = {
          mode = "dark";
          source = "builtin";
          builtin = "Rosé Pine";
        };

        wallpaper = {
          enabled = true;
          fill_mode = "crop";
          transition = [ "fade" ];
          transition_duration = 500;
          default.path = "${dotfiles}/config/nix/theme/wallpaper.jpg";
        };

        backdrop = {
          enabled = true;
          blur_intensity = 0.4;
          tint_intensity = 0.45;
        };

        notification = {
          enable_daemon = true;
          background_opacity = 1.0;
          offset_x = 8;
          offset_y = 8;
        };

        osd = {
          position = "top_center";
          background_opacity = 1.0;
          offset_y = 8;
        };

        bar.main = {
          position = "top";
          thickness = 34;
          background_opacity = 1.0;
          radius = 0;
          margin_ends = 0;
          margin_edge = 0;
          padding = 10;
          widget_spacing = 4;
          shadow = false;
          reserve_space = true;
          capsule = false;

          start = [
            "launcher"
            "workspaces"
            "active_window"
          ];
          center = [ "clock" ];
          end = [
            "media"
            "privacy"
            "tray"
            "network"
            "bluetooth"
            "volume"
            "battery"
            "notifications"
            "control-center"
            "session"
          ];
        };

        control_center = {
          sidebar = "compact";
          show_shortcut_labels = false;
          shortcuts = map (type: { inherit type; }) [
            "wifi"
            "bluetooth"
            "caffeine"
            "notification"
            "wallpaper"
            "session"
          ];
        };
      };

      uncheckedConfig = toml.generate "noctalia-config.toml" settings;
      checkedConfig = pkgs.runCommand "noctalia-config.toml" { } ''
        ${lib.getExe pkgs.noctalia} config validate ${uncheckedConfig}
        cp ${uncheckedConfig} "$out"
      '';

      noctalia =
        command:
        [
          "noctalia"
          "msg"
        ]
        ++ lib.splitString " " command;
    in
    {
      xdg.configFile."noctalia/config.toml".source = checkedConfig;

      wayland.windowManager.niri.settings = {
        spawn-at-startup = [ "noctalia" ];

        debug.honor-xdg-activation-with-invalid-serial = { };

        binds = {
          "Super+Space".spawn = noctalia "panel-toggle launcher";
          "Super+Shift+S".spawn = noctalia "panel-toggle control-center";
          "Super+Comma".spawn = noctalia "settings-toggle";
          "Super+C".spawn = noctalia "panel-toggle clipboard";
          "Alt+Tab".spawn = noctalia "window-switcher";

          "XF86AudioRaiseVolume".spawn = noctalia "volume-up";
          "XF86AudioLowerVolume".spawn = noctalia "volume-down";
          "XF86AudioMute".spawn = noctalia "volume-mute";
          "XF86MonBrightnessUp".spawn = noctalia "brightness-up";
          "XF86MonBrightnessDown".spawn = noctalia "brightness-down";
        };

        _children = [
          {
            window-rule = {
              match._props.app-id = "dev.noctalia.Noctalia";
              open-floating = true;
              default-column-width.fixed = 1080;
              default-window-height.fixed = 920;
            };
          }
          {
            layer-rule = {
              match._props.namespace = "^noctalia-backdrop";
              place-within-backdrop = true;
            };
          }
        ];
      };
    };
}
