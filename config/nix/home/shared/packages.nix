{ pkgs, ... }: {
  nixpkgs = {
    config = {
      allowUnfree = true;
      allowInsecure = true;
    };
  };

  home.packages = with pkgs; [
    # cli
    fastfetch
    lazygit
    nix-prefetch-github
    brightnessctl
    playerctl
    pulseaudio
    zellij
    btop
    lsof
    openconnect
    jq
    tmux
    openfortivpn
    opencode

    # neovim
    neovim
    zoxide
    eza
    yazi
    docker
    docker-compose
    inetutils

    # apps
    kitty
    wezterm
    chromium
    qutebrowser
    google-chrome
    nautilus
    eog
    wl-color-picker
    gnome-calculator
    papers
    gnome-text-editor
    wdisplays
    vscode
    foot
    discord
    thunderbird
    dbeaver-bin
    overskride
    libreoffice

    # other
    slurp
    grim
    mako
    tofi
    syncthing

    # dependencies
    git
    gccgo
    zig
    python314
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
    nodejs_22
    rsync
    gnumake
    xdg-desktop-portal-hyprland
    fzf
    mysql80
    bash

    # lsp's
    lua-language-server
    nil
    typescript-language-server
    typos-lsp
    markdown-oxide
    angular-language-server
    vscode-langservers-extracted

    # formatters
    stylua
    blade-formatter
    php83Packages.php-cs-fixer
    nixfmt-classic
  ];
}
