{ pkgs, ... }: {
  programs.bash = {
    enable = true;
    shellAliases = {
      # fzf with rosé pine moon theme
      fzf = ''fzf --color=bg+:#2a273f,bg:#232136,spinner:#eb6f92,hl:#c4a7e7,fg:#e0def4,header:#908caa,info:#9ccfd8,pointer:#eb6f92,marker:#ea9a97,fg+:#e0def4,prompt:#f6c177,hl+:#c4a7e7 --border --height=40% --layout=reverse'';
    };
  };
}
