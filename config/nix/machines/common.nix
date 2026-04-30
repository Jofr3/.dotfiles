{ config, inputs, pkgs, ... }:
{
  imports = [ inputs.stylix.nixosModules.stylix ];

  # boot
  boot.loader.systemd-boot.enable = true;

  # networking
  networking = {
    networkmanager.enable = true;
    firewall.enable = false;
    extraHosts = ''
      # 127.0.0.1 youtube.com
      # 127.0.0.1 www.youtube.com
      # 127.0.0.1 m.youtube.com
    '';
  };

  # nix settings
  nixpkgs.config = {
    allowUnfree = true;
    allowInsecure = true;
  };

  nix.settings = { experimental-features = "nix-command flakes"; };

  # fonts
  fonts.packages = with pkgs; [ nerd-fonts.fira-code ];

  # minimal system packages (user packages go in home-manager)
  environment.systemPackages = with pkgs; [
    home-manager
    git
    vim
    playwright-driver.browsers
  ];

  # programs
  programs = {
    hyprland = {
      enable = true;
      xwayland.enable = true;
      withUWSM = false;
    };
    niri.enable = true;
    fish.enable = true;
    ssh.startAgent = true;
    nix-ld = {
      enable = true;
      libraries = with pkgs; [
        stdenv.cc.cc.lib
        zlib
      ];
    };
  };

  # Disable GNOME's SSH agent (pulled in by niri) to avoid conflict with programs.ssh.startAgent
  services.gnome.gcr-ssh-agent.enable = false;

  # docker
  virtualisation.docker.enable = true;

  # users
  users = {
    users.jofre = {
      shell = pkgs.fish;
      initialPassword = "1234";
      isNormalUser = true;
      extraGroups = [
        "wheel"
        "docker"
        "networkmanager"
        "video"
        "audio"
        "input"
        "render"
        "adbusers"
        "jmtpfs"
        "mtpfs"
      ];
    };
    groups = { docker = { }; };
  };

  # udev rules for android
  services.udev = {
    enable = true;
    extraRules = ''
      SUBSYSTEM=="usb", ATTR{idVendor}=="12d1", MODE="0666", GROUP="adbusers"
      SUBSYSTEM=="usb", ATTR{idVendor}=="2717", MODE="0666", GROUP="adbusers"

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
  };

  # localization
  time.timeZone = "Europe/Madrid";
  i18n.defaultLocale = "en_US.UTF-8";

  # display manager
  services = {
    displayManager = {
      enable = true;
      ly.enable = true;
    };
    xserver = {
      enable = true;
      xkb = {
        layout = "us";
        variant = "";
      };
    };
    dbus.enable = true;
  };

  # audio
  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
  hardware.alsa.enablePersistence = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    jack.enable = true;
  };

  # bluetooth
  hardware.bluetooth = {
    enable = true;
    powerOnBoot = true;
  };

  # wayland
  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  };

  xdg.portal = {
    enable = true;
    wlr.enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-gtk ];
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

  system.stateVersion = "25.11";
}
