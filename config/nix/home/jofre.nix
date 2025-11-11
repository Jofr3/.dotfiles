{ pkgs, ... }: {
  imports = [
    ../home/shared/packages.nix
    ../home/shared/configs.nix
    ../home/shared/hyprland.nix
    ../home/shared/ssh.nix
    ../shared/stylix.nix
  ];

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";

    packages = with pkgs; [ hyprpicker skim ];
  };

  gtk = {
    enable = true;
    iconTheme = {
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
