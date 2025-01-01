{ ... }:
{
  programs.nixvim = {
    plugins.vim-dadbod.enable = true;
    plugins.vim-dadbod-ui.enable = true;
    plugins.vim-dadbod-cmp.enable = true;
  };
}
