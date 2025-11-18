{ inputs, pkgs, ... }:

{
  imports = [ inputs.stylix.nixosModules.stylix ];

  # boot
  boot.loader.systemd-boot.enable = true;

  # networking
  networking = {
    networkmanager.enable = true;
    firewall.enable = false;
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
  environment.systemPackages = with pkgs; [ home-manager git vim kitty ydotool ];

  # programs
  programs = {
    hyprland = {
      enable = true;
      xwayland.enable = true;
    };
    fish.enable = true;
    adb.enable = true;
    ssh.startAgent = true;
  };

  # ydotool
  systemd.services.ydotool = {
    description = "ydotool daemon";
    wantedBy = [ "multi-user.target" ];
    serviceConfig = {
      Type = "simple";
      Restart = "always";
      ExecStart = "${pkgs.ydotool}/bin/ydotoold";
      ExecReload = "${pkgs.coreutils}/bin/kill -HUP $MAINPID";
      KillMode = "process";
      TimeoutSec = 180;
    };
  };

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
        "ydotool"
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
    '';
  };

  # virtualization
  virtualisation.docker.enable = true;

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
    # flatpak.enable = true;
  };

  # audio
  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
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
  environment.sessionVariables.NIXOS_OZONE_WL = "1";

  xdg.portal = {
    enable = true;
    wlr.enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-gtk ];
  };

  # theming
  stylix = {
    enable = true;
    image = ../theme/wallpaper.jpg;
    base16Scheme = ../theme/gruvbox.yml;
    cursor = {
      package = pkgs.vanilla-dmz;
      name = "Vanilla-DMZ";
      size = 24;
    };
    polarity = "dark";
  };

  system.stateVersion = "25.05";
}
