{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = with pkgs; [
      vimPlugins."windows-nvim"
      vimPlugins."middleclass"
      vimPlugins."tabby-nvim"
    ];

    extraConfigLua = ''
      require('windows').setup({
          autowidth = {
            enable = false,
         },
         animation = {
            enable = false,
         }
      })

      local theme = {
        sep = { bg='#0B0B0B' },
        current_tab = { fg = '#83a598', bg='#0B0B0B' },
        inactive_tab = { fg = '#4F4F4F', bg='#0B0B0B' },
      }

      require('tabby').setup({
       line = function(line)
          return {
            line.tabs().foreach(function(tab)
              local hl = tab.is_current() and theme.current_tab or theme.inactive_tab
              return {
                line.sep(' ', hl, theme.sep),
                tab.number(),
                tab.name(),
                hl = hl,
                margin = ' ',
              }
            end),
            hl = theme.fill,
          }
        end,
      })

      local capabilities = require('blink.cmp').get_lsp_capabilities()
      local lspconfig = require('lspconfig')

      lspconfig['lua-ls'].setup({ capabilities = capabilities })
      lspconfig['nil_ls'].setup({ capabilities = capabilities })

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

