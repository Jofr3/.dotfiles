# Graphical workstation profile: niri, theming, audio, removable media.
# Used by nixos, nixos-lsw and nixos-pc.
{ inputs, pkgs, ... }:
{
  imports = [ inputs.stylix.nixosModules.stylix ];

  # networking
  networking.networkmanager.enable = true;

  # Tailscale client -- puts this machine on the same tailnet as nixos-remote,
  # so `ssh jofre@nixos-remote` and `http://nixos-remote:5173` work from any
  # network. Enrol once per machine, by hand, after the first rebuild:
  #   sudo tailscale up
  # The daemon just idles until then, so this is harmless on machines that
  # never join.
  #
  # Note: the tailnet interface is deliberately NOT in firewall.trustedInterfaces
  # here (unlike the server) -- these machines only need to reach out. Add
  # `networking.firewall.trustedInterfaces = [ "tailscale0" ];` if you ever want
  # to connect *to* one of them over the tailnet.
  services.tailscale = {
    enable = true;
    openFirewall = true; # UDP 41641, for direct peer connections instead of relaying
  };

  users.users.jofre.extraGroups = [
    "networkmanager"
    "video"
    "audio"
    "input"
    "render"
  ];

  # fonts
  fonts.packages = with pkgs; [ nerd-fonts.fira-code ];

  environment.systemPackages = with pkgs; [ playwright-driver.browsers ];

  programs.niri.enable = true;

  # Disable GNOME's SSH agent (pulled in by niri) to avoid conflict with programs.ssh.startAgent
  services.gnome.gcr-ssh-agent.enable = false;

  # Wooting udev rules
  services.udev.extraRules = ''
    # Wooting One Legacy
    SUBSYSTEM=="hidraw", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="ff01", TAG+="uaccess"
    SUBSYSTEM=="usb", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="ff01", TAG+="uaccess"

    # Wooting One update mode
    SUBSYSTEM=="hidraw", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2402", TAG+="uaccess"

    # Wooting Two Legacy
    SUBSYSTEM=="hidraw", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="ff02", TAG+="uaccess"
    SUBSYSTEM=="usb", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="ff02", TAG+="uaccess"

    # Wooting Two update mode
    SUBSYSTEM=="hidraw", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2403", TAG+="uaccess"

    # Generic Wooting devices
    SUBSYSTEM=="hidraw", ATTRS{idVendor}=="31e3", TAG+="uaccess"
    SUBSYSTEM=="usb", ATTRS{idVendor}=="31e3", TAG+="uaccess"
  '';

  # display manager
  services = {
    displayManager.ly.enable = true;
    xserver = {
      enable = true;
      xkb = {
        layout = "us";
        variant = "";
      };
    };
  };

  # audio
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    jack.enable = true;
  };

  # bluetooth
  hardware.bluetooth.enable = true;

  # wayland
  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  };

  # usb
  services.gvfs.enable = true;
  services.udisks2.enable = true;
  hardware.usb-modeswitch.enable = true;

  # theming
  stylix = {
    enable = true;
    image = ../theme/wallpaper.jpg;
    base16Scheme = "${pkgs.base16-schemes}/share/themes/rose-pine-moon.yaml";
    cursor = {
      package = pkgs.vanilla-dmz;
      name = "Vanilla-DMZ";
      size = 24;
    };
    polarity = "dark";
  };

  # auto shutdown at 21:30 on Mon-Thu
  systemd.services.auto-shutdown = {
    description = "Automatic shutdown at 9:30 PM (weekdays except Friday)";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${pkgs.systemd}/bin/shutdown now";
    };
  };

  systemd.timers.auto-shutdown = {
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "Mon,Tue,Wed,Thu *-*-* 21:30:00";
      Persistent = false;
    };
  };
}
