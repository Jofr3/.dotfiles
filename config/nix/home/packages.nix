{ pkgs, ... }: {
  home.packages = with pkgs; [
    # cli tools
    btop
    brightnessctl
    claude-code
    pi-coding-agent
    opencode
    direnv
    eza
    fastfetch
    fd
    fzf
    jq
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
    agent-browser
    jujutsu

    # editors
    neovim
    vscode

    # terminals
    foot
    kitty

    # browsers
    chromium
    google-chrome

    # apps
    dbeaver-bin
    eog
    gnome-calculator
    gnome-text-editor
    libreoffice
    nautilus
    overskride
    thunderbird
    wdisplays
    zathura
    pinta

    # wayland utilities
    cliphist
    grim
    satty
    slurp
    swaybg
    wl-clipboard
    wl-color-picker
    wtype
    xwayland-satellite

    # vpn
    openconnect
    openfortivpn

    # development tools
    bun
    docker-compose
    gcc
    gnumake
    ninja
    sshpass
    uv

    # languages & runtimes
    go
    lua
    luajitPackages.luarocks
    sqlcmd
    mysql84
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
  ];
}
