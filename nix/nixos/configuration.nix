{
  inputs,
  lib,
  _config,
  pkgs,
  ...
}:
{
  imports = [
    ./hardware-configuration.nix
  ];

  boot.loader.systemd-boot.enable = true;

  networking.networkmanager.enable = true;

  nixpkgs = {
    overlays = [
      # neovim-nightly-overlay.overlays.default
    ];
    config = {
      allowUnfree = true;
      allowInsecure = true;
    };
  };

  nix =
    let
      flakeInputs = lib.filterAttrs (_: lib.isType "flake") inputs;
    in
    {
      settings = {
        experimental-features = "nix-command flakes";
      };
    };

  networking.hostName = "nixos";

  fonts.packages = with pkgs; [
    fira-code-nerdfont
  ];

  environment.systemPackages = with pkgs; [
    home-manager
    fish
    hyprland
    hyprpaper

    bluez
    bluez-tools
    blueman
  ];

  users.users = {
    jofre = {
      initialPassword = "1234";
      isNormalUser = true;
      openssh.authorizedKeys.keys = [
        # TODO: Add your SSH public key(s) here, if you plan on using SSH to connect
      ];
      extraGroups = [
        "wheel"
        "docker"
      ];
    };
  };

  virtualisation.docker.enable = true;

  time.timeZone = "Europe/Madrid";
  i18n.defaultLocale = "en_US.UTF-8";

  services.xserver.enable = true;
  services.xserver.displayManager.gdm.enable = true;

  programs.hyprland = {
    enable = true;
    xwayland.enable = true;
  };

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

  # services.libinput.enable = true;

  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";
  };

  hardware = {
    opengl.enable = true;
    nvidia.modesetting.enable = true;
    bluetooth.enable = true;
    bluetooth.powerOnBoot = true;
  };

  xdg.portal.enable = true;
  xdg.portal.extraPortals = [ pkgs.xdg-desktop-portal-gtk ];

  programs.fish.enable = true;
  users.defaultUserShell = pkgs.fish;

  stylix = {
    enable = true;
    image = ./../../wallpapers/15.jpg;
    base16Scheme = ./theme.yml;
    polarity = "dark";
  };

  system.stateVersion = "25.05";
}
