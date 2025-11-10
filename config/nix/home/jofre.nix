{ pkgs, lib, ... }: {
  imports = [
    ../home/shared/packages.nix
   # ../home/shared/stylix.nix
    ../home/shared/configs.nix
    ../home/shared/hyprland.nix
    ../home/shared/ssh.nix
  ];

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";

    packages = with pkgs; [
      dbeaver-bin

      overskride

      hyprpicker

      skim

      libreoffice-qt

      syncthing

      angular-language-server
      vscode-langservers-extracted

      tmux
      openfortivpn

      opencode
    ];
  };

  gtk = {
    enable = true;
    iconTheme = {
      # name = "Papirus-Dark";
      # package = pkgs.papirus-icon-theme;

      name = "Adwaita";
      package = pkgs.adwaita-icon-theme;
    };
  };

  services = {
    hyprpaper = {
      enable = true;
      settings = {
        ipc = false;
        preload = [ "~/.dotfiles/wallpapers/16.png" ];
        wallpaper = [ "eDP-1,~/.dotfiles/wallpapers/16.png" ];
      };
    };
    syncthing = { enable = true; };
  };

  systemd.user.startServices = "sd-switch";

  home.enableNixpkgsReleaseCheck = false;
  home.stateVersion = "25.05";
  programs.home-manager.enable = true;
}
