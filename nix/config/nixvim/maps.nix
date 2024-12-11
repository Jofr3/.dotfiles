{ ... }:
{
  programs.nixvim = {
    keymaps = [
      {
        mode = [ "v" ];
        key = "<C-c>";
        action = "\"+y";
        options = { };
      }
      {
        mode = [
          "n"
          "v"
        ];
        key = "<C-v>";
        action = "\"+p";
        options = { };
      }
      {
        mode = [ "i" ];
        key = "<C-v>";
        action = "<Esc>\"+p";
        options = { };
      }

      {
        mode = [ "v" ];
        key = "<A-h>";
        action = "<gv";
        options = { };
      }
      {
        mode = [ "v" ];
        key = "<A-l>";
        action = ">gv";
        options = { };
      }

      {
        mode = [ "v" ];
        key = "<A-j>";
        action = ":m '>+1<CR>gv=gv";
        options = { };
      }
      {
        mode = [ "v" ];
        key = "<A-k>";
        action = ":m '<-2<CR>gv=gv";
        options = { };
      }

      {
        mode = [ "n" ];
        key = "<C-n>";
        action = "<cmd>Oil<cr>";
        options = {
          silent = true;
        };
      }

      {
        mode = [ "n" ];
        key = "<A-h>";
        action = "<cmd>lua require('smart-splits').move_cursor_left()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-j>";
        action = "<cmd>lua require('smart-splits').move_cursor_down()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-k>";
        action = "<cmd>lua require('smart-splits').move_cursor_up()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-l>";
        action = "<cmd>lua require('smart-splits').move_cursor_right()<cr>";
        options = {
          remap = true;
        };
      }

      {
        mode = [ "n" ];
        key = "<A-H>";
        action = "<cmd>lua require('smart-splits').resize_left()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-J>";
        action = "<cmd>lua require('smart-splits').resize_down()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-K>";
        action = "<cmd>lua require('smart-splits').resize_up()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-L>";
        action = "<cmd>lua require('smart-splits').resize_right()<cr>";
        options = {
          remap = true;
        };
      }

      {
        mode = [ "n" ];
        key = "<A-C-h>";
        action = "<cmd>lua require('smart-splits').swap_buf_left()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-C-j>";
        action = "<cmd>lua require('smart-splits').swap_buf_down()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-C-k>";
        action = "<cmd>lua require('smart-splits').swap_buf_up()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<A-C-l>";
        action = "<cmd>lua require('smart-splits').swap_buf_right()<cr>";
        options = {
          remap = true;
        };
      }

      {
        mode = [ "n" ];
        key = "<C-f>";
        action = "<cmd>lua require('telescope.builtin').find_files()<cr>";
        options = {
          remap = true;
        };
      }
      #{mode = [ "n" ]; key = "<C-v>"; action = "<cmd>lua require('telescope.builtin').live_grep()<cr>"; options = { remap = true; }; }
      {
        mode = [ "n" ];
        key = "<Leader><Leadear>";
        action = "<cmd>lua require('telescope.builtin').resume()<cr>";
        options = {
          remap = true;
        };
      }
      {
        mode = [ "n" ];
        key = "<Leader>u";
        action = "<cmd>Telescope undo<cr>";
        options = {
          remap = true;
        };
      }

      {
        mode = [ "n" ];
        key = "<C-m>";
        action = "<cmd>WindowsMaximize<cr>";
        options = {
          remap = true;
        };
      }

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

      {
        mode = [ "i" ];
        key = "<A-Tab>";
        action = "<cmd>lua require('luasnip').expand()<cr>";
        options = {
          silent = true;
        };
      }

      {
        mode = [
          "n"
          "i"
        ];
        key = "<leader>a";
        action = "<cmd>lua require('conform').format({ async = true, lsp_fallback = true })<cr>";
        options = {
          silent = true;
        };
      }
    ];
  };
}
