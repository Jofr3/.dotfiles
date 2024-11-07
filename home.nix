{ config, pkgs, ... }:

{
  home.username = "jofre";
  home.homeDirectory = "/home/jofre";

  home.stateVersion = "24.05";

  home.packages = with pkgs; [
    fastfetch
    kitty
    neovim
    chromium
  ];

  home.sessionVariables = {
    EDITOR = "nvim";
  };

  programs.home-manager.enable = true;
}
