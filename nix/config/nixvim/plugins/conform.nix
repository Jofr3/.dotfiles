{ ... }:
{
  programs.nixvim = {
    plugins = {
      conform-nvim = {
        enable = true;
        settings = {
          formatters_by_ft = {
            nix = [ "nixfmt" ];
          };
        };
      };
    };
    keymaps = [
      {
        mode = [ "n" ];
        key = "<leader>a";
        action = "<cmd>lua require('conform').format({ async = true, lsp_fallback = true })<cr>";
        options = {
          silent = true;
        };
      }
    ];
  };
}
