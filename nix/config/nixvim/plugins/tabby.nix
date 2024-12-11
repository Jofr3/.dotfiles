{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = with pkgs; [
      vimPlugins."tabby-nvim"
    ];

    keymaps = [
      {
        mode = [ "n" ];
        key = "<Leader>t";
        action = "<cmd>$tabnew<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>c";
        action = "<cmd>tabclose<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>1";
        action = "1gt";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>2";
        action = "2gt";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>3";
        action = "3gt";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>4";
        action = "4gt";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>5";
        action = "5gt";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>6";
        action = "6gt";
        options = {
          remap = true;
        };
      }
    ];

    extraConfigLua = ''
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
    '';
  };
}
