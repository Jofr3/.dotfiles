{ config, pkgs, ... }: {
  imports = [
    ../home/shared/configs.nix
    ../home/shared/hyprland.nix
    ../home/shared/packages.nix
    ../home/shared/ssh.nix
    ../home/shared/stylix.nix
  ];

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";
    stateVersion = "25.05";
    enableNixpkgsReleaseCheck = false;

    packages = with pkgs; [ hyprpicker skim vivaldi ];
  };

  programs.home-manager.enable = true;

  gtk = {
    enable = true;
    iconTheme = {
      name = "Adwaita";
      package = pkgs.adwaita-icon-theme;
    };
  };

  services = {
    syncthing.enable = true;
  };

  systemd.user.startServices = "sd-switch";
}
