{ pkgs, ... }:
{
  programs.nixvim = {
    extraPlugins = [(pkgs.vimUtils.buildVimPlugin {
        name = "rsync";
        src = pkgs.fetchFromGitHub {
            owner = "OscarCreator";
            repo = "rsync.nvim";
            rev = "70be22f23eee7879ebd1bc01de077eca77bdb680";
            hash = "sha256-IdU23rswdtT26QRL2e8VyMWLKfnL1K1AawWDEKVl3rw=";
        };
    })];

    keymaps = [
    ];
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
