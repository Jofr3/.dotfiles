return {
  "kdheepak/lazygit.nvim",
  enabled = true,
  lazy = false,
  -- cmd = {
  --   "LazyGit",
  --   "LazyGitConfig",
  --   "LazyGitCurrentFile",
  --   "LazyGitFilter",
  --   "LazyGitFilterCurrentFile",
  -- },
  dependencies = { "nvim-lua/plenary.nvim" },
  keys = {
    { mode = "n", "<A-g>", "<cmd>LazyGit<cr>" }
  }
}
