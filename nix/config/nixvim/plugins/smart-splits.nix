{ ... }:
{
  programs.nixvim = {
    plugins = {
      smart-splits.enable = true;
    };
    keymaps = [
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
    ];
  };
}
