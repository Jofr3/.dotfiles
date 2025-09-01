{ inputs, lib, config, pkgs, ... }: {
  imports = [ ./hardware-configuration.nix ];

  boot.loader.systemd-boot.enable = true;

  networking.networkmanager.enable = true;

  nixpkgs = {
    config = {
      allowUnfree = true;
      allowInsecure = true;
    };
  };

  nix = let flakeInputs = lib.filterAttrs (_: lib.isType "flake") inputs;
  in { settings = { experimental-features = "nix-command flakes"; }; };

  networking.hostName = "nixos";
  networking.firewall.enable = false;

  fonts.packages = with pkgs;
    [
      nerd-fonts.fira-code

      # to try
      # creep
      # tamzen
      # curie
      # envypn-font
      # scientifica
      # tewi-font
      # uw-ttyp0
    ];

  environment.systemPackages = with pkgs; [
    python312Packages.qtile
    river
    wayland
    xwayland
    libinput

    home-manager
    fish
    hyprland
    hyprpaper
    kitty
    bash
  ];

  programs.hyprland = {
    enable = true;
    xwayland.enable = true;
  };

  programs.fish.enable = true;

  users.users = {
    jofre = {
      shell = pkgs.fish;
      initialPassword = "1234";
      isNormalUser = true;
      extraGroups = [
        "wheel"
        # "docker"
        "networkmanager"
        "video"
        "audio"
        "input"
        "render"
        "dialout"
        "plugdev"
        "kvm"
        "adbusers"
      ];
    };
  };

  users.groups = {
    # docker = { };
    plugdev = { };
  };

  services.udev = {
    enable = true;
    packages = [ pkgs.android-udev-rules ];
    extraRules = ''
      SUBSYSTEM=="usb", ATTR{idVendor}=="12d1", MODE="0666", GROUP="plugdev"
    '';
  };

  # virtualisation.docker.enable = true;

  time.timeZone = "Europe/Madrid";
  i18n.defaultLocale = "en_US.UTF-8";

  services.xserver.enable = true;
  services.displayManager.enable = true;
  services.displayManager.ly.enable = true;

  services.dbus.enable = true;

  services.xserver.xkb = {
    layout = "us";
    variant = "";
  };

  hardware.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    jack.enable = true;
  };

  services.flatpak.enable = true;

  environment.sessionVariables = { NIXOS_OZONE_WL = "1"; };

  hardware = {
    graphics.enable = true;
    bluetooth.enable = true;
    bluetooth.powerOnBoot = true;
  };

  xdg.portal = {
    enable = true;
    wlr.enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-gtk ];
  };

  programs.ssh = {
    startAgent = true;
  };

  services.gnome.gnome-keyring.enable = true;

  #services.xserver.videoDrivers = [ "nvidia" ];

  #hardware.nvidia = {
  # modesetting.enable = true;
  # powerManagement.enable = false;
  # powerManagement.finegrained = false;
  #open = false;
  # nvidiaSettings = true;
  # package = config.boot.kernelPackages.nvidiaPackages.stable;
  # };

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
