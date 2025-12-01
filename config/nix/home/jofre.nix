{ config, pkgs, ... }: {
  imports = [
    ../home/shared/bash.nix
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

    sessionVariables = {
      FZF_DEFAULT_OPTS = "--color=bg+:#2a273f,bg:#232136,spinner:#eb6f92,hl:#c4a7e7,fg:#e0def4,header:#908caa,info:#9ccfd8,pointer:#eb6f92,marker:#ea9a97,fg+:#e0def4,prompt:#f6c177,hl+:#c4a7e7";
    };
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
