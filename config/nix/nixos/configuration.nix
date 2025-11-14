{ inputs, lib, pkgs, ... }:
let
  pciDevicesFile = /proc/bus/pci/devices;
  hasNvidiaGPU = if builtins.pathExists pciDevicesFile then
    builtins.any (line: builtins.match ".*10de.*" line != null)
    (lib.splitString "\n" (builtins.readFile pciDevicesFile))
  else
    false;

  hardwareModul = if hasNvidiaGPU then ./hardware-nvidia.nix else ./hardware-intel.nix;
  graphicsModule = if hasNvidiaGPU then ./graphics-nvidia.nix else ./graphics-intel.nix;
in {
  imports = [
    hardwareModul
    graphicsModule
    inputs.stylix.nixosModules.stylix
  ];

  # boot
  boot.loader.systemd-boot.enable = true;

  # networking
  networking = {
    hostName = "nixos";
    networkmanager.enable = true;
    firewall.enable = false;
  };

  # nix settings
  nixpkgs.config = {
    allowUnfree = true;
    allowInsecure = true;
  };

  nix.settings = {
    experimental-features = "nix-command flakes";
    substituters = [
      "https://cache.nixos.org"
      "https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store"
      "https://mirror.sjtu.edu.cn/nix-channels/store"
    ];
    trusted-public-keys =
      [ "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY=" ];
    connect-timeout = 60;
  };

  # fonts
  fonts.packages = with pkgs; [ nerd-fonts.fira-code ];

  # minimal system packages (user packages go in home-manager)
  environment.systemPackages = with pkgs; [ home-manager git vim kitty ];

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
    flatpak.enable = true;
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
