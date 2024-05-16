{ config, pkgs, ... }:

{
  imports =
    [
      ./hardware-configuration.nix
    ];

  # Bootloader.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

    boot.kernelModules = [ "fuse" ];

  networking.hostName = "nixos"; # Define your hostname.
  networking.wireless.enable = true;  # Enables wireless support via wpa_supplicant.

  # Enable networking
  networking.networkmanager.enable = true;

  # Set your time zone.
  time.timeZone = "Europe/Madrid";

  # Select internationalisation properties.
  i18n.defaultLocale = "en_US.UTF-8";

  hardware.bluetooth.enable = true;
  hardware.bluetooth.powerOnBoot = true;

  i18n.extraLocaleSettings = {
    LC_ADDRESS = "es_ES.UTF-8";
    LC_IDENTIFICATION = "es_ES.UTF-8";
    LC_MEASUREMENT = "es_ES.UTF-8";
    LC_MONETARY = "es_ES.UTF-8";
    LC_NAME = "es_ES.UTF-8";
    LC_NUMERIC = "es_ES.UTF-8";
    LC_PAPER = "es_ES.UTF-8";
    LC_TELEPHONE = "es_ES.UTF-8";
    LC_TIME = "es_ES.UTF-8";
  };

  # Enable the X11 windowing system.
  services.xserver = {
    enable = true;
    displayManager.gdm.enable = true;
  };

    services.sysprof.enable = true;

  # Enable the GNOME Desktop Environment.
  # services.xserver.desktopManager.gnome.enable = true;

  # Configure keymap in X12
  services.xserver.xkb = {
    layout = "us";
    variant = "";
  };

  # Enable CUPS to print documents.
  services.printing.enable = true;

  # Enable sound with pipewire.
  sound.enable = true;
  hardware.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    # If you want to use JACK applications, uncomment this
    #jack.enable = true;

    # use the example session manager (no others are packaged yet so this is enabled by default,
    # no need to redefine it in your config for now)
    #media-session.enable = true;
  };

  # Enable touchpad support (enabled default in most desktopManager).
  # services.xserver.libinput.enable = true;


  # Define a user account. Don't forget to set a password with ‘passwd’.
  users.users.jofre = {
    isNormalUser = true;
    description = "jofre";
    extraGroups = [ "networkmanager" "wheel" ];
    shell = pkgs.fish;
    packages = with pkgs; [
      alacritty
      google-chrome
      chromium
    ];
  };

  # Allow unfree packages
  nixpkgs.config.allowUnfree = true;

  # List packages installed in system profile. To search, run:
  environment.systemPackages = with pkgs; [
    home-manager

    # window manager
    brightnessctl
    dmenu-wayland
    hyprpaper
    mako

    # tools
    dconf
    gnome.adwaita-icon-theme
    dialect
    wordbook
    gnome-text-editor
    gnome.totem
    gnome.gnome-notes
    gnome.gnome-calculator
    gnome.nautilus
    gnome.eog
    gnome.evince
    gnome.geary
    wdisplays
    komikku
    lorem
    newsflash

    zsh
    fish
    # dependencies
    fastfetch
    zoxide
    tmux
    eza

    neovim
    # dependencies
    luajitPackages.luarocks
    php83Packages.composer
    python312Packages.pip
    nodejs_21
    python3
    cargo
    julia
    ruby
    php
    jdk
    gcc
    git
    go

    # utils
    gnutar
    unzip
    wget
    curl
    gzip
    bash

    # sus
    shc

    # extra utils
    wl-clipboard
    tree-sitter
    ripgrep
    fzf
    fd

    # language servers
    lua-language-server
    nodePackages.vls
    nil

    # formatters
    nixpkgs-fmt
    stylua
  ];

  fonts.packages = with pkgs; [
    fira-code
    fira-code-symbols
    fira-code-nerdfont

  ];

  # Some programs need SUID wrappers, can be configured further or are
  # started in user sessions.
  # programs.mtr.enable = true;
  # programs.gnupg.agent = {
  #   enable = true;
  #   enableSSHSupport = true;
  # };
    programs.fish = {
        enable = true;
    };

    programs.dconf.enable = true;
    services.gnome.gnome-keyring.enable = true;

  programs.sway = {
    enable = false;
    # wrapperFeatures.gtk = false;
  };

  programs.hyprland = {
    enable = true;
    xwayland.enable = true;
  };

  environment.sessionVariables = {
    WLR_NO_HARDWARE_CURSOR = "1";
    NIXOS_OZONE_WL = "1";
  };

  hardware = {
     opengl = {
        enable = true;
    };
    nvidia.modesetting.enable = true;
  };

  # List services that you want to enable:

  # Enable the OpenSSH daemon.
  # services.openssh.enable = true;

  # Open ports in the firewall.
  # networking.firewall.allowedTCPPorts = [ ... ];
  # networking.firewall.allowedUDPPorts = [ ... ];
  # Or disable the firewall altogether.
  # networking.firewall.enable = false;

  # This value determines the NixOS release from which the default
  # settings for stateful data, like file locations and database versions
  # on your system were taken. It‘s perfectly fine and recommended to leave
  # this value at the release version of the first install of this system.
  # Before changing this value read the documentation for this option
  # (e.g. man configuration.nix or on https://nixos.org/nixos/options.html).
  #system.stateVersion = "23.11"; # Did you read the comment?
  system.stateVersion = "unstable"; # Did you read the comment?
    nixpkgs.config.allowBroken = true;

  nix.settings.experimental-features = [ "nix-command" "flakes" ];
}
