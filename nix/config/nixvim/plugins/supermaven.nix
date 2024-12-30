{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = with pkgs; [
      vimPlugins."supermaven-nvim"
    ];

    extraConfigLua = ''
      config = function()
            require("supermaven-nvim").setup({
                  keymaps = {
                    accept_suggestion = "<A-Tab>",
                    accept_word = "<A-Space>",
                  },
            })
      end
    '';
  };
}
