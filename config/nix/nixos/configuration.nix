{ inputs, lib, pkgs, ... }:
let
  pciDevicesFile = /proc/bus/pci/devices;
  hasNvidiaGPU = if builtins.pathExists pciDevicesFile then
    builtins.any (line: builtins.match ".*10de.*" line != null)
    (lib.splitString "\n" (builtins.readFile pciDevicesFile))
  else
    false;

  graphicsModule =
    if hasNvidiaGPU then ./graphics-nvidia.nix else ./graphics-intel.nix;
in {
  imports = [
    ./hardware-configuration.nix
    graphicsModule
    inputs.stylix.nixosModules.stylix
  ];

  boot.loader.systemd-boot.enable = true;

  networking.networkmanager.enable = true;

  nixpkgs = {
    config = {
      allowUnfree = true;
      allowInsecure = true;
    };
  };

  nix = let flakeInputs = lib.filterAttrs (_: lib.isType "flake") inputs;
  in { 
    settings = { 
      experimental-features = "nix-command flakes";
      substituters = [
        "https://cache.nixos.org"
        "https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store"
        "https://mirror.sjtu.edu.cn/nix-channels/store"
      ];
      trusted-public-keys = [
        "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      ];
      connect-timeout = 60;
    };
  };

  networking.hostName = "nixos";
  networking.firewall.enable = false;

  fonts.packages = with pkgs; [ nerd-fonts.fira-code ];

  environment.systemPackages = with pkgs; [
    python312Packages.qtile
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
        "docker"
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

  programs.adb.enable = true;

  users.groups = {
    docker = { };
    plugdev = { };
  };

  services.udev = {
    enable = true;
    extraRules = ''
      SUBSYSTEM=="usb", ATTR{idVendor}=="12d1", MODE="0666", GROUP="adbusers"
      SUBSYSTEM=="usb", ATTR{idVendor}=="2717", MODE="0666", GROUP="adbusers"
    '';
  };

  virtualisation.docker.enable = true;

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

  services.pulseaudio.enable = false;
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
    bluetooth.enable = true;
    bluetooth.powerOnBoot = true;
  };

  xdg.portal = {
    enable = true;
    wlr.enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-gtk ];
  };

  programs.ssh = { startAgent = true; };

  stylix = {
    enable = true;
    image = ../theme/wallpaper.jpg;
    # base16Scheme = "${pkgs.base16-schemes}/share/themes/tokyo-night-dark.yaml";
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
