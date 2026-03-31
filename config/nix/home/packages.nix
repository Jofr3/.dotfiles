{ pkgs, ... }: {
  home.packages = with pkgs; [
    # cli tools
    btop
    brightnessctl
    claude-code
    direnv
    eza
    fastfetch
    fd
    fzf
    jq
    lazygit
    lsof
    nix-prefetch-github
    pulseaudio
    ripgrep
    rsync
    sops
    ssh-to-age
    tmux
    unzip
    wget
    sox

    # editors
    neovim
    vscode

    # terminals
    foot
    kitty

    # browsers
    chromium
    google-chrome
    firefox

    # apps
    dbeaver-bin
    discord
    eog
    gnome-calculator
    libreoffice
    nautilus
    overskride
    postman
    thunderbird
    wdisplays
    zathura
    pinta

    # wayland utilities
    cliphist
    grim
    hyprpicker
    slurp
    swaybg
    wl-clipboard
    wl-color-picker
    wtype
    xdg-desktop-portal-hyprland

    # vpn
    openconnect
    openfortivpn

    # development tools
    bun
    docker
    docker-compose
    git
    gnumake
    ninja
    sshpass
    uv

    # languages & runtimes
    gccgo
    lua
    luajitPackages.luarocks
    sqlcmd
    mysql80
    nodejs_22
    rustup
    sqlite
    zig
    php
    python315

    # lsp servers
    angular-language-server
    lua-language-server
    markdown-oxide
    marksman
    nil
    typescript-language-server
    typos-lsp
    vscode-langservers-extracted

    # formatters
    blade-formatter
    nixfmt
    php83Packages.php-cs-fixer
    stylua

    # temporary
    vtsls
    intelephense
    opencode
  ];
}
