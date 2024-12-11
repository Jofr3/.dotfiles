{ ... }:
{
  programs.nixvim = {
    plugins = {
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
    };

    keymaps = [
      {
        mode = [ "n" ];
        key = "<C-f>";
        action = "<cmd>lua require('telescope.builtin').find_files()<cr>";
        options = {
          remap = true;
        };
      }
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
    ];
  };
}
