return {
  "augmentcode/augment.vim",
  enabled = false,
  lazy = false,
  init = function()
    vim.cmd[[let g:augment_workspace_folders = ['~/nix', '~/.dotfiles/config/nvim'] ]]
  end,
}
