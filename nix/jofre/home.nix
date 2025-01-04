{
  lib,
  pkgs,
  inputs,
  ...
}:
{
  nixpkgs = {
    overlays = [
      (final: prev: {
        vimPlugins = prev.vimPlugins // {
          arsync = prev.vimUtils.buildVimPlugin {
            name = "arsync";
            src = inputs.plugin-arsync;
          };
        };
      })
      (final: prev: {
        vimPlugins = prev.vimPlugins // {
          async = prev.vimUtils.buildVimPlugin {
            name = "async";
            src = inputs.plugin-async;
          };
        };
      })
      # neovim-nightly-overlay.overlays.default
    ];
    config = {
      allowUnfree = true;
      allowInsecure = true;
    };
  };

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";
  };

  home.packages = with pkgs; [
    # cli
    fastfetch

    # neovim
    zoxide
    eza
    yazi
    docker
    docker-compose
    inetutils

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
    vscode
    dbeaver-bin

    # other
    dmenu-wayland
    wofi
    bitwarden-cli
    rbw
    rofi-rbw
    openconnect
    dropbox-cli

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

    sshpass

    # formatters
    nixfmt-rfc-style
  ];

  programs = {
    home-manager.enable = true;

    git = {
      enable = true;
      userName = "Jofr3";
      userEmail = "jofrescari@gmail.com";
    };

    ssh.enable = true;
  };

  stylix = {
    enable = true;
    image = ./../../wallpapers/15.jpg;
    base16Scheme = "${pkgs.base16-schemes}/share/themes/gruvbox-dark-hard.yaml";
    polarity = "dark";

    override = {
      base00 = "0B0B0B";
    };
  };

  home.activation = {
    cloneDotfiles = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      if [ ! -d "/home/jofre/.dotfiles" ]; then
      	${pkgs.git}/bin/git clone https://github.com/Jofr3/.dotfiles /home/jofre/.dotfiles
      fi

      if [ ! -L "/home/jofre/.config/kitty" ]; then
        ln -s /home/jofre/.dotfiles/config/kitty /home/jofre/.config/kitty
      fi

      if [ ! -L "/home/jofre/.config/fish" ]; then
        ln -s /home/jofre/.dotfiles/config/fish /home/jofre/.config/fish
      fi

      if [ ! -L "/home/jofre/.config/qutebrowser" ]; then
        ln -s /home/jofre/.dotfiles/config/qutebrowser /home/jofre/.config/qutebrowser
      fi

      if [ ! -L "/home/jofre/.config/rbw" ]; then
        ln -s /home/jofre/.dotfiles/config/rbw /home/jofre/.config/rbw
      fi
    '';
  };

  imports = [
    ../config/nixvim
    ../config/hyprland
  ];

  systemd.user.startServices = "sd-switch";
  home.stateVersion = "24.05";
}
