{ ... }:
{
  programs.nixvim = {
    plugins.luasnip.enable = true;
    keymaps = [
      {
        mode = [ "i" ];
        key = "<A-Tab>";
        action = "<cmd>lua require('luasnip').expand()<cr>";
        options = {
          silent = true;
        };
      }
    ];
    extraConfigLua = ''
      local ls = require('luasnip')

      local s = ls.snippet
      local t = ls.text_node
      local i = ls.insert_node

      ls.add_snippets('nix', {
          s('test', {
              t('lol')
          }),
      })
    '';
  };
}
