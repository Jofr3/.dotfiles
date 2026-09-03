# Packages not tied to a feature file. GUI applications live in
# ../desktop/packages.nix, headless extras in ../server/packages.nix.
{
  # Minimal system-wide set; everything user-facing goes through Home Manager.
  flake.modules.nixos.base =
    { pkgs, ... }:
    {
      environment.systemPackages = [ pkgs.vim ];
    };

  flake.modules.homeManager.base =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        # cli tools
        btop
        claude-code
        pi-coding-agent
        agent-browser
        opencode
        direnv
        eza
        fastfetch
        fd
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
        harlequin

        # editors
        neovim

        # development tools
        bun
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

        #pi
        firecrawl-cli
      ];
    };
}
