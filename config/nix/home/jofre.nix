{ pkgs, ... }: {
  imports = [
    ../home/shared/packages.nix
    ../home/shared/stylix.nix
    ../home/shared/configs.nix
    # ../home/shared/scripts.nix
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
      postman

      libreoffice-qt

      tree-sitter-grammars.tree-sitter-zig

      syncthing
      gemini-cli
    ];
  };

  gtk = {
    enable = true;
    iconTheme = {
      name = "Papirus-Dark";
      package = pkgs.papirus-icon-theme;
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
