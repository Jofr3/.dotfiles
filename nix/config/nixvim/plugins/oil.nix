{ ... }:
{
  programs.nixvim = {
    plugins = {
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
    };

    keymaps = [
      {
        mode = [ "n" ];
        key = "<C-n>";
        action = "<cmd>Oil<cr>";
        options = {
          silent = true;
        };
      }
    ];

    autoCmd = [
      {
        event = [ "FileType" ];
        pattern = [ "oil" ];
        callback = {
          __raw = ''
            function() 
                vim.opt_local.number = false 
                vim.opt_local.relativenumber = false 
            end
          '';
        };
      }
    ];
  };
}
