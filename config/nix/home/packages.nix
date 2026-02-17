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
    tmux
    unzip
    wget
    zellij
    zoxide

    # editors
    emacs-pgtk
    neovim
    vscode

    # terminals
    foot
    kitty
    wezterm

    # browsers
    chromium
    google-chrome
    firefox

    # apps
    dbeaver-bin
    discord
    eog
    gnome-calculator
    gnome-text-editor
    libreoffice
    nautilus
    overskride
    postman
    thunderbird
    wdisplays
    zathura

    # wayland utilities
    cliphist
    grim
    hyprpicker
    slurp
    swaybg
    tofi
    wl-clipboard
    wl-color-picker
    wtype
    xdg-desktop-portal-hyprland

    # vpn
    openconnect
    openfortivpn

    # development tools
    bruno-cli
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
    mysql80
    nodejs_22
    rustup
    sqlite
    zig

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
