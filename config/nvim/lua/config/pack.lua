vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

vim.pack.add({
  { src = "https://github.com/rose-pine/neovim",               name = "rose-pine" },
  -- { src = "https://github.com/ellisonleao/gruvbox.nvim" },
  { src = "https://github.com/nvim-mini/mini.icons" },
  -- { src = "https://github.com/nvim-tree/nvim-web-devicons" },
  { src = "https://github.com/nvim-treesitter/nvim-treesitter" },
  -- { src = "https://github.com/neovim/nvim-lspconfig" },
  { src = "https://github.com/saghen/blink.cmp",               version = vim.version.range("1") },
  { src = "https://github.com/folke/snacks.nvim" },
  -- { src = "https://github.com/nvim-telescope/telescope.nvim",  version = "0.1.8" },
  -- { src = "https://github.com/nvim-lua/plenary.nvim" },
  { src = "https://github.com/stevearc/oil.nvim" },
  { src = "https://github.com/tpope/vim-fugitive" },
  { src = "https://github.com/lewis6991/gitsigns.nvim" },
  { src = "https://github.com/echasnovski/mini.diff" },
  { src = "https://github.com/folke/ts-comments.nvim" },
  { src = "https://github.com/mrjones2014/smart-splits.nvim" },
  { src = "https://github.com/nguyenvukhang/nvim-toggler" },
  { src = "https://github.com/akinsho/bufferline.nvim" },
  { src = "https://github.com/Jofr3/sftp.nvim" },
  { src = "https://github.com/MunifTanjim/nui.nvim" },
  { src = "https://github.com/kndndrj/nvim-dbee" },
})

vim.api.nvim_create_autocmd("PackChanged", {
  callback = function(args)
    if args.data.spec.name == "nvim-dbee" and args.data.kind ~= "delete" then
      vim.schedule(function()
        require("dbee").install()
      end)
    end
  end,
})

require("plugins.theme")
require("plugins.icons")
require("plugins.treesitter")
require("plugins.lsp")
require("plugins.blink")
require("plugins.picker")
require("plugins.oil")
require("plugins.git")
require("plugins.comment")
require("plugins.smart-splits")
require("plugins.toggle")
require("plugins.tabs")
require("plugins.sftp")
require("plugins.dbee")
-- require("plugins.telescope")
