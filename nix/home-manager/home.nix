{ inputs, lib, config, pkgs, ... }: 
{
  imports = [ ];

  nixpkgs = {
    overlays = [
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
    neovim
    zoxide
    eza

    # apps
    kitty
    chromium
    qutebrowser
    obsidian
    google-chrome
    nautilus
    gnome-randr
    eog

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
  ];

  programs = {
    home-manager.enable = true;
    git = {
      enable = true;
      userName = "Jofr3";
      userEmail = "jofrescari@gmail.com";
    };
    ssh = {
     enable = true;
     # keyFiles = [
        # "~/.ssh/id_rsa"
     # ];
    };
  };

  stylix = {
    enable = true;
    image = ./../../wallpapers/15.jpg;
    base16Scheme = "${pkgs.base16-schemes}/share/themes/gruvbox-dark-hard.yaml";
    polarity = "dark";
  };

  home.activation = {
    cloneDotfiles = lib.hm.dag.entryAfter ["writeBoundary"] ''
      if [ ! -d "/home/jofre/.dotfiles" ]; then
      	${pkgs.git}/bin/git clone https://github.com/Jofr3/.dotfiles /home/jofre/.dotfiles
      fi

      if [ -d "/home/jofre/.config/hypr" ]; then
        rm -rf /home/jofre/.config/hypr
      fi

      if [ ! -L "/home/jofre/.config/hypr" ]; then
        ln -s /home/jofre/.dotfiles/config/hypr /home/jofre/.config/hypr
      fi

      if [ ! -L "/home/jofre/.config/kitty" ]; then
        ln -s /home/jofre/.dotfiles/config/kitty /home/jofre/.config/kitty
      fi

      if [ ! -L "/home/jofre/.config/fish" ]; then
        ln -s /home/jofre/.dotfiles/config/fish /home/jofre/.config/fish
      fi

      if [ ! -L "/home/jofre/.config/nvim" ]; then
        ln -s /home/jofre/.dotfiles/config/nvim /home/jofre/.config/nvim
      fi

      if [ ! -L "/home/jofre/.config/qutebrowser" ]; then
        ln -s /home/jofre/.dotfiles/config/qutebrowser /home/jofre/.config/qutebrowser
      fi

      if [ ! -L "/home/jofre/.config/rbw" ]; then
        ln -s /home/jofre/.dotfiles/config/rbw /home/jofre/.config/rbw
      fi
    '';
  };

  systemd.user.startServices = "sd-switch";
  home.stateVersion = "24.05";
}
