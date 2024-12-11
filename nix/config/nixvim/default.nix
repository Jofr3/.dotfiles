{ pkgs, ... }:
{
  programs.nixvim = {
    enable = true;
    plugins = {
      comment = {
        enable = true;
        settings = {
          padding = false;
          ignore = "^$";
        };
      };
      oil = {
        enable = true;
        settings = {
          delete_to_trash = true;
          view_options.show_hidden = true;
          win_options.signcolumn = "yes";
          use_default_keymaps = false;
          keymaps = {
            "q" = "actions.close";
            "<C-x>" = "actions.select_split";
            "<C-r>" = "actions.refresh";
            "<C-p>" = "actions.preview";
            "<C-v>" = "actions.select_vsplit";
            "<CR>" = "actions.select";
            "<C-h>" = "actions.open_cwd";
            "<C-t>" = "actions.toggle_trash";
            "gx" = "actions.open_external";
          };
        };
      };
      smart-splits.enable = true;
      telescope = {
        enable = true;
        settings.defaults = {
          file_ignore_patterns = [
            "public_html"
            "node_modules"
            "assets"
            "android"
            "ios"
          ];
        };
        extensions.undo.enable = true;
      };
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
      web-devicons.enable = true;
      lsp = {
        enable = true;
        servers = {
          lua_ls.enable = true;
          nil_ls.enable = true;
        };
        keymaps = {
          lspBuf = {
            "<C-a>" = "format";
          };
        };
      };

      blink-cmp = {
        enable = true;
        settings = {
          keymap = {
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
      luasnip = {
        enable = true;
      };
      conform-nvim = {
        enable = true;
        settings = {
          formatters_by_ft = {
            nix = [ "nixfmt" ];
          };
        };
      };
    };

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

    imports = [
      ./init.nix
      ./maps.nix
      ./highlights.nix
      ./plugins
    ];
  };
}
