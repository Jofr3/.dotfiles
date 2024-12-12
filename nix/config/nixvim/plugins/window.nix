{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = with pkgs; [
      vimPlugins."windows-nvim"
      vimPlugins."middleclass"
    ];

    keymaps = [
      {
        mode = [ "n" ];
        key = "<C-m>";
        action = "<cmd>WindowsMaximize<cr>";
        options = {
          remap = true;
        };
      }
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
    '';
  };
}
