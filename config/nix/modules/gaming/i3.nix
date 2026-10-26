# Optional X11 gaming session, alongside the host's usual desktop session.
{
  flake.modules.nixos.gaming =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      i3Config = pkgs.writeText "i3-gaming.conf" ''
        set $mod Mod4
        font pango:monospace 10
        floating_modifier $mod
        default_border pixel 1
        default_floating_border pixel 1
        focus_follows_mouse no

        bindsym $mod+Return exec ${pkgs.xterm}/bin/xterm
        bindsym $mod+d exec ${pkgs.dmenu}/bin/dmenu_run
        bindsym $mod+s exec ${config.programs.steam.package}/bin/steam
        bindsym $mod+o exec ${config.programs.steam.package}/bin/steam -applaunch 2357570
        bindsym $mod+Shift+q kill
        bindsym $mod+f fullscreen toggle
        bindsym $mod+Shift+space floating toggle
        bindsym $mod+space focus mode_toggle
        bindsym $mod+h focus left
        bindsym $mod+j focus down
        bindsym $mod+k focus up
        bindsym $mod+l focus right
        bindsym $mod+Shift+h move left
        bindsym $mod+Shift+j move down
        bindsym $mod+Shift+k move up
        bindsym $mod+Shift+l move right

        bindsym $mod+1 workspace number 1
        bindsym $mod+2 workspace number 2
        bindsym $mod+3 workspace number 3
        bindsym $mod+4 workspace number 4
        bindsym $mod+5 workspace number 5
        bindsym $mod+Shift+1 move container to workspace number 1
        bindsym $mod+Shift+2 move container to workspace number 2
        bindsym $mod+Shift+3 move container to workspace number 3
        bindsym $mod+Shift+4 move container to workspace number 4
        bindsym $mod+Shift+5 move container to workspace number 5

        bindsym $mod+Shift+c reload
        bindsym $mod+Shift+e exec ${pkgs.i3}/bin/i3-nagbar -t warning -m 'Leave the gaming session?' -b 'Log out' '${pkgs.i3}/bin/i3-msg exit'
        bindsym $mod+Shift+x exec ${pkgs.i3lock}/bin/i3lock -c 000000
        bindsym XF86AudioRaiseVolume exec ${pkgs.pulseaudio}/bin/pactl set-sink-volume @DEFAULT_SINK@ +5%
        bindsym XF86AudioLowerVolume exec ${pkgs.pulseaudio}/bin/pactl set-sink-volume @DEFAULT_SINK@ -5%
        bindsym XF86AudioMute exec ${pkgs.pulseaudio}/bin/pactl set-sink-mute @DEFAULT_SINK@ toggle

        # No compositor or bar; fullscreen games can present without composition.
      '';
    in
    {
      services.xserver = {
        enable = true;
        # AMD's DDX has its own TearFree buffering, independent of Picom.
        enableTearFree = false;
        deviceSection = lib.mkIf (builtins.elem "amdgpu" config.services.xserver.videoDrivers) ''
          Option "TearFree" "false"
        '';
        windowManager.i3 = {
          enable = true;
          extraPackages = with pkgs; [
            dmenu
            xterm
            xrandr
          ];
          extraSessionCommands = ''
            # The desktop layer prefers Wayland globally; this session uses X11.
            unset NIXOS_OZONE_WL WAYLAND_DISPLAY
          '';
          configFile = pkgs.runCommand "i3-gaming.conf" { } ''
            ${pkgs.i3}/bin/i3 -C -c ${i3Config}
            cp ${i3Config} "$out"
          '';
        };
      };

      services.picom.enable = false;
    };
}
