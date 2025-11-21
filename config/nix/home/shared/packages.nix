{ pkgs, ... }: {
  nixpkgs.config = {
    allowUnfree = true;
    allowInsecure = true;
  };

  home.packages = with pkgs; [
    # cli tools
    btop
    brightnessctl
    eza
    fastfetch
    fd
    fzf
    jq
    lazygit
    lsof
    nix-prefetch-github
    opencode
    playerctl
    ripgrep
    rsync
    tmux
    unzip
    wget
    zellij
    zoxide

    # editors
    neovim
    vscode

    # terminals
    foot
    kitty
    wezterm

    # browsers
    chromium
    google-chrome
    qutebrowser

    # apps
    dbeaver-bin
    discord
    eog
    gnome-calculator
    gnome-text-editor
    libreoffice
    nautilus
    overskride
    papers
    thunderbird
    wdisplays

    # wayland utilities
    cliphist
    grim
    slurp
    tofi
    wl-clipboard
    wl-color-picker
    wtype
    xdg-desktop-portal-hyprland

    # vpn
    openconnect
    openfortivpn

    # development tools
    docker
    docker-compose
    git
    gnumake
    bun

    # languages & runtimes
    cargo
    gccgo
    lua
    luajitPackages.luarocks
    mysql80
    nodejs_22
    python314
    rustc
    sqlite
    zig

    # lsp servers
    angular-language-server
    lua-language-server
    markdown-oxide
    nil
    typescript-language-server
    typos-lsp
    vscode-langservers-extracted

    # formatters
    blade-formatter
    nixfmt-classic
    php83Packages.php-cs-fixer
    stylua
  ];
}
