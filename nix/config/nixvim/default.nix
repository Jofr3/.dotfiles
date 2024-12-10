{ config, pkgs, ... }: {
  programs.nixvim = {
    enable = true;
    
    # Global settings
    globals = {
      mapleader = " ";
    };

    # Basic options
    opts = {
      number = true;
      relativenumber = true;
      shiftwidth = 2;
      tabstop = 2;
      expandtab = true;
      clipboard = "unnamedplus";
    };

    # Import other Nixvim configuration files
    imports = [
      # ./plugins.nix
      # ./keymaps.nix
    ];
  };
}
