{ inputs, lib, config, pkgs, ... }: 
{
  description = "Home manager";

  #inputs = {
  #  nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  #  home-manager = {
  #    url = "github:nixos/home-manager";
  #    inputs.nixpkgs.follows = "nixpkgs";
  #  };
  #};

  outputs = { self, nixpkgs, home-manager, ... } @ inputs:
    let
        inherit (self) outputs;
    in {
      homeConfigurations = {
        "jofre@nixos" = home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.x86_64-linux;
          modules = [
            {
              # Home Manager settings
              home = {
                username = "jofre";
                homeDirectory = "/home/jofre";
                stateVersion = "24.05";
              };

              nixpkgs = {
                overlays = [
                  # neovim-nightly-overlay.overlays.default
                ];
                config = {
                  allowUnfree = true;
                  allowInsecure = true;
                };
              };

              home.packages = with pkgs; [ 
                # cli
                fastfetch
                #neovim
                zoxide
                eza
                yazi

                # apps
                kitty
                chromium
                qutebrowser
                obsidian
                google-chrome
                nautilus
                gnome-randr
                eog
                wl-color-picker
                gnome-calculator
                papers
                gnome-bluetooth
                gnome-screenshot
                dialect
                apostrophe
                errands

                # other
                dmenu-wayland
                wofi
                bitwarden-cli
                rbw
                rofi-rbw

                # dependencies
                git
                gccgo
                zig
                python39
                lua
                luajitPackages.luarocks
                unzip
                wget
                ripgrep
                fd
                rustc
                cargo
                sqlite
                wl-clipboard-rs
                wtype
                pinentry-tty
                openssl
                nodejs_23

                # lsp's
              ];

              programs = {
                home-manager.enable = true;

                git = {
                  enable = true;
                  userName = "Jofr3";
                  userEmail = "jofrescari@gmail.com";
                };
              };

            }
          ];
        };
      };
    };
}
