{ ... }:
{
  programs.nixvim = {
    plugins = {
      blink-cmp = {
        enable = true;
        settings = {
          keymaps = {
            "<C-j>" = [
              "select_next"
              "fallback"
            ];
            "<C-k>" = [
              "select_prev"
              "fallback"
            ];
            "<Tab>" = [
              "select_and_accept"
              "fallback"
            ];
          };
        };
      };
    };

    extraConfigLua = ''
      local capabilities = require('blink.cmp').get_lsp_capabilities()
      local lspconfig = require('lspconfig')

      lspconfig['lua-ls'].setup({ capabilities = capabilities })
      lspconfig['nil_ls'].setup({ capabilities = capabilities })
    '';
  };
}
