# Shared by every machine, headless or graphical.
# Anything that only makes sense with a screen attached lives in
# ../profiles/desktop.nix; server-only bits live in ../profiles/server.nix.
{ inputs, pkgs, ... }:
{
  # boot
  boot.loader.systemd-boot.enable = true;

  # nix settings
  nixpkgs.config.allowUnfree = true;

  nix.settings = {
    experimental-features = "nix-command flakes";
  };

  # minimal system packages (user packages go in home-manager)
  environment.systemPackages = with pkgs; [
    inputs.home-manager.packages.${pkgs.stdenv.hostPlatform.system}.home-manager
    git
    vim
  ];

  # programs
  programs = {
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
      ];
    };
  };

  # localization
  time.timeZone = "Europe/Madrid";
  i18n.defaultLocale = "en_US.UTF-8";

  system.stateVersion = "25.11";
}
