{ config, lib, ... }:
let
  dotfiles = config.home.homeDirectory + "/.dotfiles";
  wallpaper = dotfiles + "/config/nix/theme/wallpaper.jpg";
in {
  services.hyprpaper = {
    enable = true;
    settings = {
      preload = [ wallpaper ];
      wallpaper = [
        "HDMI-A-1,${wallpaper}"
        "eDP-1,${wallpaper}"
      ];
      splash = false;
      ipc = true;
    };
  };

  wayland.windowManager.hyprland = {
    enable = true;
    settings = {
      "$mod" = "SUPER";

      animations.enabled = false;

      general = {
        border_size = 0;
        gaps_in = 0;
        gaps_out = 0;
      };

      group = {
        auto_group = true;
        groupbar = {
          render_titles = false;
          gaps_in = 0;
          gaps_out = 0;
          "col.active" = lib.mkForce "rgba(C4A7E780)";
          "col.inactive" = lib.mkForce "rgba(6E6A8680)";
        };
      };

      input = {
        kb_layout = "us,ca";
        kb_options = "caps:escape";
        repeat_delay = 250;
        repeat_rate = 30;
      };

      bind = [
        # window management
        "$mod, Q, killactive"

        # launchers
        "$mod, Return, exec, footclient"
        "$mod, C, exec, bash ${dotfiles}/scripts/clipboard-launcher.sh"
        "$mod, O, exec, bash ${dotfiles}/scripts/apps-launcher.sh"
        "$mod, K, exec, bash ${dotfiles}/scripts/bookmarks-launcher.sh"
        "$mod, P, exec, bash ${dotfiles}/scripts/passwords-launcher.sh"
        "$mod, X, exec, bash ${dotfiles}/scripts/commands-launcher.sh"

        # credentials
        "$mod, A, exec, wtype -M alt $(cat /tmp/username) -m alt"
        "$mod, S, exec, wtype -M alt $(cat /tmp/password) -m alt"

        # brightness
        "$mod, Left, exec, brightnessctl set 5%-"
        "$mod, Right, exec, brightnessctl set +5%"

        # volume
        "$mod, Up, exec, pactl set-sink-volume @DEFAULT_SINK@ +5%"
        "$mod, Down, exec, pactl set-sink-volume @DEFAULT_SINK@ -5%"

        # workspaces
        "$mod, W, workspace, 1"
        "$mod, H, workspace, 2"
        "$mod, M, workspace, 3"
        "$mod, D, workspace, 4"
        "$mod, F, workspace, 5"
        "$mod, I, workspace, 6"
        "$mod, E, workspace, 7"

        # move to workspace
        "$mod SHIFT, W, movetoworkspace, 1"
        "$mod SHIFT, H, movetoworkspace, 2"
        "$mod SHIFT, M, movetoworkspace, 3"
        "$mod SHIFT, D, movetoworkspace, 4"
        "$mod SHIFT, F, movetoworkspace, 5"
        "$mod SHIFT, I, movetoworkspace, 6"
        "$mod SHIFT, E, movetoworkspace, 7"

        # groups (tabs)
        "$mod, Tab, changegroupactive, f"
      ];

      bindm = [ "$mod, mouse:272, movewindow" "$mod, mouse:273, resizewindow" ];

      windowrulev2 = [
        # Auto-group all windows
        "group set, class:.*"
        "group deny, class:^(launcher)$"
        "group deny, class:^(footclient)$"
        "group deny, class:^(code)$"

        # App launcher
        "float, class:^(launcher)$"
        "center, class:^(launcher)$"
        "size 300 400, class:^(launcher)$"
        "rounding 10, class:^(launcher)$"
        "pin, class:^(launcher)$"

        # Workspace assignments
        "workspace 1, class:^(firefox)$"
        "workspace 2, class:^(chromium-browser)$"
        "workspace 3, class:^(thunderbird)$"
        "workspace 4, class:^(DBeaver)$"
        "workspace 7, class:^(code)$"
      ];

      env = [ "XCURSOR_SIZE,24" "HYPRCURSOR_SIZE,24" "QT_CURSOR_SIZE,24" ];

      monitor = [
        "HDMI-A-1, preferred, 0x0, 1"
        "eDP-1, 1920x1080@60, 0x1080, 1"
      ];

      workspace = [
        "1, monitor:eDP-1"
        "2, monitor:HDMI-A-1"
        "3, monitor:eDP-1"
        "4, monitor:eDP-1"
        "5, monitor:eDP-1"
        "6, monitor:eDP-1"
        "7, monitor:eDP-1"
        "8, monitor:eDP-1"
      ];

      exec-once = [
        "systemctl --user start hyprpaper"
        "wl-paste --watch cliphist store"
        "foot --server"
      ];
    };
  };
}
