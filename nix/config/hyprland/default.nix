{ ... }:
{
  wayland.windowManager.hyprland = {
    enable = true;
    settings = {
      monitor = ",preferred,auto,auto";
      "$terminal" = "kitty";
      "$fileManager" = "nautilus";
      "$menu" = "wofi --show drun";
      "$mod" = "SUPER";
      env = [
        "XCURSOR_SIZE,24"
        "HYPRCURSOR_SIZE,24"
      ];
      general = {
        gaps_in = "0";
        gaps_out = "0";
        border_size = "0";
      };
      decoration = {
        rounding = "0";
        shadow.enabled = false;
        blur.enabled = false;
      };

      animations = {
        enabled = true;

        bezier = [
          "easeOutQuint,0.23,1,0.32,1"
          "easeInOutCubic,0.65,0.05,0.36,1"
          "linear,0,0,1,1"
          "almostLinear,0.5,0.5,0.75,1.0"
          "quick,0.15,0,0.1,1"
        ];

        animation = [
          "global, 1, 10, default"
          "border, 1, 5.39, easeOutQuint"
          "windows, 1, 4.79, easeOutQuint"
          "windowsIn, 1, 4.1, easeOutQuint, popin 87%"
          "windowsOut, 1, 1.49, linear, popin 87%"
          "fadeIn, 1, 1.73, almostLinear"
          "fadeOut, 1, 1.46, almostLinear"
          "fade, 1, 3.03, quick"
          "layers, 1, 3.81, easeOutQuint"
          "layersIn, 1, 4, easeOutQuint, fade"
          "layersOut, 1, 1.5, linear, fade"
          "fadeLayersIn, 1, 1.79, almostLinear"
          "fadeLayersOut, 1, 1.39, almostLinear"
          "workspaces, 0, 1.94, almostLinear, fade"
          "workspacesIn, 0, 1.21, almostLinear, fade"
          "workspacesOut, 0, 1.94, almostLinear, fade"
        ];
      };

      input = {
        kb_layout = "us";
      };

      bindm = [
        "$mod, mouse:272, movewindow"
        "$mod, mouse:273, resizewindow"
      ];

      bind = [
        "$mod, M, fullscreen"
        "$mod, F, togglefloating"

        "$mod, Q, exec, kitty"
        "$mod, C, killactive"
        "$mod, P, exec, dmenu-wl_run"

        "$mod, Return, exec, kitty"
        "$mod, N, exec, nautilus"
        "$mod, O, exec, grim -g \"$(slurp)\" \"/home/jofre/Documents/screenshots/$(date +%Y%m%d-%H%M%S)\".png"

        "$mod, H, movefocus, l"
        "$mod, L, movefocus, r"
        "$mod, K, movefocus, u"
        "$mod, J, movefocus, d"

        "$mod SHIFT, H, movewindow, l"
        "$mod SHIFT, L, movewindow, r"
        "$mod SHIFT, K, movewindow, u"
        "$mod SHIFT, J, movewindow, d"

        "$mod Ctrl, H, resizeactive, -160 0"
        "$mod Ctrl, L, resizeactive, 160 0"
        "$mod Ctrl, K, resizeactive, 0 -160"
        "$mod Ctrl, J, resizeactive, 0 160"

        "$mod, 1, workspace, 1"
        "$mod, 2, workspace, 2"
        "$mod, 3, workspace, 3"
        "$mod, 8, workspace, 4"
        "$mod, 9, workspace, 5"
        "$mod, 0, workspace, 6"

        "$mod SHIFT, 1, movetoworkspace, 1"
        "$mod SHIFT, 2, movetoworkspace, 2"
        "$mod SHIFT, 3, movetoworkspace, 3"
        "$mod SHIFT, 8, movetoworkspace, 4"
        "$mod SHIFT, 9, movetoworkspace, 5"
        "$mod SHIFT, 0, movetoworkspace, 6"
      ];
    };
  };
}
