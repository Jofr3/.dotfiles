{ config, ... }:
let
  dotfiles = config.home.homeDirectory + "/.dotfiles";
  screenshotDir = config.home.homeDirectory + "/Documents/screenshots";
in {
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

      input = {
        kb_layout = "us,ca";
        kb_options = "caps:escape";
        repeat_delay = 250;
        repeat_rate = 30;
      };

      bind = [
        # window management
        "$mod, C, killactive"
        "$mod, T, togglefloating"

        # launchers
        "$mod, Return, exec, foot"
        "$mod, F, exec, exec $(tofi-run --drun-launch=true --fuzzy-match=true)"

        # scripts
        "$mod, B, exec, ${dotfiles}/scripts/bookmarks.sh"
        "$mod, L, exec, ${dotfiles}/scripts/passwords.sh"
        "$mod, Q, exec, wl-copy < /tmp/username"
        "$mod, W, exec, wl-copy < /tmp/password"

        # screenshot
        ''
          $mod, X, exec, grim -g "$(slurp)" "${screenshotDir}/$(date +%Y%m%d-%H%M%S).png"''

        # brightness
        "$mod, I, exec, brightnessctl set 5%-"
        "$mod, O, exec, brightnessctl set +5%"

        # volume
        "$mod, Up, exec, pactl set-sink-volume @DEFAULT_SINK@ +5%"
        "$mod, Down, exec, pactl set-sink-volume @DEFAULT_SINK@ -5%"

        # media
        "$mod, Left, exec, playerctl previous"
        "$mod, Right, exec, playerctl next"

        # keyboard layout
        "$mod, Space, exec, hyprctl switchxkblayout active next"

        # workspaces
        "$mod, 1, workspace, 1"
        "$mod, 2, workspace, 2"
        "$mod, 3, workspace, 3"
        "$mod, 4, workspace, 4"
        "$mod, 7, workspace, 5"
        "$mod, 8, workspace, 6"
        "$mod, 9, workspace, 7"
        "$mod, 0, workspace, 8"

        # move to workspace
        "$mod SHIFT, 1, movetoworkspace, 1"
        "$mod SHIFT, 2, movetoworkspace, 2"
        "$mod SHIFT, 3, movetoworkspace, 3"
        "$mod SHIFT, 4, movetoworkspace, 4"
        "$mod SHIFT, 7, movetoworkspace, 5"
        "$mod SHIFT, 8, movetoworkspace, 6"
        "$mod SHIFT, 9, movetoworkspace, 7"
        "$mod SHIFT, 0, movetoworkspace, 8"
      ];

      bindm = [ "$mod, mouse:272, movewindow" "$mod, mouse:273, resizewindow" ];

      env = [ "XCURSOR_SIZE,24" "HYPRCURSOR_SIZE,24" "QT_CURSOR_SIZE,24" ];

      monitor =
        [ "eDP-1, 1920x1080@60, 0x1080, 1" "HDMI-A-1, 1920x1080@144, 0x0, 1" ];

      workspace = [
        "1, monitor:eDP-1"
        "2, monitor:eDP-1"
        "3, monitor:eDP-1"
        "4, monitor:eDP-1"
        "5, monitor:eDP-1"
        "6, monitor:eDP-1"
        "7, monitor:eDP-1"
        "8, monitor:HDMI-A-1"
      ];

      exec-once = [ "hyprpaper" ];
    };
  };
}
