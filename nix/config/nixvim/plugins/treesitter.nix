{ ... }:
{
  programs.nixvim = {
    plugins = {
      treesitter = {
        enable = true;
        settings = {
          ensure_installed = [
            "lua"
            "vim"
            "vimdoc"
            "markdown"
            "markdown_inline"
            "nix"
          ];
          highlight.enable = true;
        };
      };
    };
  };
}
