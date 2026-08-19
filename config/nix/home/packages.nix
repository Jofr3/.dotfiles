# Packages every machine gets. GUI applications live in ./desktop/packages.nix.
{ pkgs, ... }: {
  home.packages = with pkgs; [
    # cli tools
    btop
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
    ripgrep
    rsync
    sops
    ssh-to-age
    tmux
    unzip
    wget
    jujutsu
    yazi

    # editors
    neovim

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
