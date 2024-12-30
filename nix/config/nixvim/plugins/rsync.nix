{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = with pkgs; [
      vimPlugins."arsync"
      vimPlugins."async"
    ];

    extraConfigLua = ''
      --require('nvim-sftp-sync').setup({})
    '';
  };
}

#{
#    'OscarCreator/rsync.nvim',
#    build = 'make',
#    dependencies = 'nvim-lua/plenary.nvim',
#    config = function()
#        require("rsync").setup()
#    end,
#}
