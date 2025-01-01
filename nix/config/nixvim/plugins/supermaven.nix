{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = with pkgs; [
      vimPlugins."supermaven-nvim"
    ];

    extraConfigLua = ''
        require("supermaven-nvim").setup({
              keymaps = {
                accept_suggestion = "<A-Tab>",
                accept_word = "<S-Tab>",
              },
        })
    '';
  };
}
