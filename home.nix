{ config, pkgs, lib, ... }:
{
  home.username = "jofre";
  home.homeDirectory = "/home/jofre";

  home.stateVersion = "24.05";

  home.packages = with pkgs; [
    git
    fastfetch
    kitty
    neovim
    chromium
  ];

  programs = {
    git = {
      enable = true;
      userName = "Jofr3";
      userEmail = "jofrescari@gmail.com";
    };

    #ssh = {
     # enable = true;
     # keyFiles = [
     # "~/.ssh/id_rsa"
     #];
    #}
  };

  home.sessionVariables = {
    EDITOR = "nvim";
  };

  home.activation = {
    cloneDotgiles = lib.hm.dag.entryAfter ["writeBoundary"] ''
      ${pkgs.git}/bin/git clone https://github.com/Jofr3/nix /home/jofre/test
    '';
  };

  #home.file.".config/kitty" = {
  #  source = "/home/your-username/.dotfiles/config/kitty";
  #};

  programs.home-manager.enable = true;
}
