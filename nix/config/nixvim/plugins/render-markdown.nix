{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = with pkgs; [
      vimPlugins."render-markdown-nvim"
    ];

    extraConfigLua = ''
        require('render-markdown').setup({
            heading = {
                sign = false,
                icons = { ' ', ' ', ' ', ' ', ' ', ' ' },
            }
        })

    '';
  };
}
