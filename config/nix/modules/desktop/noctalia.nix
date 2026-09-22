# A transient hardware island for Niri. Noctalia only owns this surface and
# the volume/brightness OSDs; the rest of the desktop stays compositor-native.
{
  flake.modules.nixos.desktop.programs.noctalia.enable = true;

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

      islandControl = pkgs.writeShellApplication {
        name = "noctalia-island";
        runtimeInputs = [
          pkgs.coreutils
          pkgs.noctalia
        ];
        text = ''
          state_dir="''${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is not set}/noctalia-island"
          timer_file="$state_dir/timer.pid"

          arm_timer() {
            mkdir -p "$state_dir"

            if [[ -r "$timer_file" ]]; then
              read -r timer_pid < "$timer_file" || true
              if [[ "$timer_pid" =~ ^[0-9]+$ ]]; then
                kill "$timer_pid" 2>/dev/null || true
              fi
            fi

            (
              sleep 5
              noctalia msg bar-hide island
            ) >/dev/null 2>&1 &
            printf '%s\n' "$!" > "$timer_file"
          }

          case "''${1:-show}" in
            show)
              noctalia msg bar-show island
              ;;
            network)
              noctalia msg panel-toggle control-center network
              ;;
            bluetooth)
              noctalia msg panel-toggle control-center bluetooth
              ;;
            wifi-toggle)
              noctalia msg wifi-toggle
              ;;
            bluetooth-toggle)
              noctalia msg bluetooth-toggle
              ;;
            *)
              echo "usage: noctalia-island {show|network|bluetooth|wifi-toggle|bluetooth-toggle}" >&2
              exit 2
              ;;
          esac

          arm_timer
        '';
      };

      settings = {
        shell = {
          clipboard_enabled = false;
          corner_radius_scale = 1.0;
          font_family = "FiraCode Nerd Font";
          telemetry_enabled = false;

          animation = {
            enabled = true;
            speed = 1.2;
          };

          shadow = {
            direction = "down";
            alpha = 0.5;
          };

          panel = {
            control_center_placement = "floating";
            control_center_position = "auto";
            floating_offset = 12;
            open_near_click_control_center = false;
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
          show_app_name = true;
          show_actions = true;
          keep_dismissed_in_history = true;
          layer = "top";
          background_opacity = 0.96;
          offset_x = 16;
          offset_y = 12;
        };

        control_center = {
          sidebar = "none";
          sidebar_section = "none";
        };

        lockscreen.enabled = false;
        system.monitor.enabled = false;
        dock.enabled = false;
        desktop_widgets.enabled = false;

        osd = {
          enabled = true;
          position = "top_left";
          background_opacity = 0.96;
          offset_x = 16;
          offset_y = 12;

          kinds = {
            volume = true;
            volume_output = true;
            volume_input = false;
            brightness = true;
            wifi = false;
            bluetooth = false;
            power_profile = false;
            caffeine = false;
            nightlight = false;
            dnd = false;
            lock_keys = false;
            keyboard_layout = false;
            privacy = false;
          };
        };

        bar = {
          order = [ "island" ];

          island = {
            enabled = true;
            position = "top";
            layer = "overlay";
            auto_hide = false;
            smart_auto_hide = false;
            show_on_workspace_switch = false;
            reserve_space = false;

            thickness = 44;
            background_opacity = 0.96;
            border = "outline";
            border_width = 1.0;
            radius = 22;
            concave_edge_corners = false;
            # Noctalia bars use fixed end margins rather than content-sized
            # layer surfaces. Both configured Niri outputs are 1920 px wide,
            # so this produces a compact 180 px island without a transparent
            # full-width surface obscuring windows beneath it.
            margin_ends = 870;
            margin_edge = 8;
            padding = 14;
            widget_spacing = 14;
            shadow = true;
            capsule = false;

            start = [ ];
            center = [
              "network"
              "bluetooth"
            ];
            end = [ ];
          };
        };

        widget = {
          network = {
            show_label = true;
            vpn_status = "hidden";
            actions = {
              left = "exec ${lib.getExe islandControl} network";
              right = "exec ${lib.getExe islandControl} wifi-toggle";
              middle = "none";
            };
          };

          bluetooth = {
            show_label = true;
            actions = {
              left = "exec ${lib.getExe islandControl} bluetooth";
              right = "exec ${lib.getExe islandControl} bluetooth-toggle";
              middle = "none";
            };
          };
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
        _children = [
          {
            spawn-at-startup._args = [
              "sh"
              "-c"
              "noctalia --daemon && noctalia msg bar-hide island"
            ];
          }
          {
            layer-rule = {
              match._props.namespace = "^noctalia-backdrop";
              place-within-backdrop = true;
            };
          }
        ];

        binds = {
          "Super+B".spawn = [
            (lib.getExe islandControl)
            "show"
          ];

          "XF86AudioRaiseVolume".spawn = noctalia "volume-up";
          "XF86AudioLowerVolume".spawn = noctalia "volume-down";
          "XF86AudioMute".spawn = noctalia "volume-mute";
          "XF86MonBrightnessUp".spawn = noctalia "brightness-up";
          "XF86MonBrightnessDown".spawn = noctalia "brightness-down";
        };
      };
    };
}
